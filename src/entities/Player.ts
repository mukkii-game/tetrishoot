import { BLOCK_SIZE, CANVAS_HEIGHT, CANVAS_WIDTH, PLAYER_INITIAL_Y, PLAYER_SPEED } from '../config';
import { ParticleManager } from '../effects/Particle';
import { PlayerBullet } from './Bullet';
import { TetrominoPiece, TetrominoType } from './Tetromino';

export interface AttachedPiece {
  piece: TetrominoPiece;
  relGx: number; // 自機アンカーに対する相対グリッドX
  relGy: number; // 自機アンカーに対する相対グリッドY
}

export class Player {
  public anchorX: number; // 自機の基準ピクセルX（グリッドの基準点）
  public anchorY: number; // 自機の基準ピクセルY
  public vx = 0; // エクセリオン風慣性速度X
  public vy = 0; // エクセリオン風慣性速度Y
  public pieces: AttachedPiece[] = [];
  public fireCooldown = 0;
  public isDead = false;

  constructor() {
    this.anchorX = Math.floor(CANVAS_WIDTH / 2 - BLOCK_SIZE);
    this.anchorY = PLAYER_INITIAL_Y;
    this.initInitialPiece();
  }

  // ドッキングフェーズ開始時に自機を下部中央へ移動
  public resetToBottomCenter(): void {
    this.anchorX = Math.floor(CANVAS_WIDTH / 2 - BLOCK_SIZE);
    this.anchorY = PLAYER_INITIAL_Y;
    this.vx = 0;
    this.vy = 0;
  }

  // 初期の自機：Oミノ（正方形2x2、端点なし＝弾なし、肉壁コア）
  public initInitialPiece(): void {
    this.pieces = [];
    const oPiece = new TetrominoPiece('O');
    this.pieces.push({
      piece: oPiece,
      relGx: 0,
      relGy: 0,
    });
    this.vx = 0;
    this.vy = 0;
  }

  // 占有しているすべての絶対グリッド座標を返す
  public getOccupiedCells(): { gx: number; gy: number; piece: TetrominoPiece }[] {
    const baseGx = Math.round(this.anchorX / BLOCK_SIZE);
    const baseGy = Math.round(this.anchorY / BLOCK_SIZE);
    const cells: { gx: number; gy: number; piece: TetrominoPiece }[] = [];

    for (const attached of this.pieces) {
      for (const c of attached.piece.cells) {
        cells.push({
          gx: baseGx + attached.relGx + c.gx,
          gy: baseGy + attached.relGy + c.gy,
          piece: attached.piece,
        });
      }
    }
    return cells;
  }

  // 自機のバウンディングボックス（ピクセル単位）
  public getBoundingBox(): { minX: number; maxX: number; minY: number; maxY: number } {
    let minRelGx = 999;
    let maxRelGx = -999;
    let minRelGy = 999;
    let maxRelGy = -999;

    for (const attached of this.pieces) {
      for (const c of attached.piece.cells) {
        const gx = attached.relGx + c.gx;
        const gy = attached.relGy + c.gy;
        if (gx < minRelGx) minRelGx = gx;
        if (gx > maxRelGx) maxRelGx = gx;
        if (gy < minRelGy) minRelGy = gy;
        if (gy > maxRelGy) maxRelGy = gy;
      }
    }

    return {
      minX: this.anchorX + minRelGx * BLOCK_SIZE,
      maxX: this.anchorX + (maxRelGx + 1) * BLOCK_SIZE,
      minY: this.anchorY + minRelGy * BLOCK_SIZE,
      maxY: this.anchorY + (maxRelGy + 1) * BLOCK_SIZE,
    };
  }

  // 落下中のミノが自機と接触しているか判定し、結合確定
  public tryDock(
    fallingPiece: TetrominoPiece,
    fallGx: number,
    fallGy: number
  ): { docked: boolean; piece?: TetrominoPiece } {
    const playerBaseGx = Math.round(this.anchorX / BLOCK_SIZE);
    const playerBaseGy = Math.round(this.anchorY / BLOCK_SIZE);

    const fallingAbsoluteCells = fallingPiece.cells.map(c => ({
      gx: fallGx + c.gx,
      gy: fallGy + c.gy,
    }));

    const myCells = this.getOccupiedCells();

    // 重なりチェック
    for (const fc of fallingAbsoluteCells) {
      for (const mc of myCells) {
        if (fc.gx === mc.gx && fc.gy === mc.gy) {
          return { docked: false };
        }
      }
    }

    // 上から、または左右からの接触があるか
    let isAdjacent = false;
    for (const fc of fallingAbsoluteCells) {
      for (const mc of myCells) {
        // 上から接触
        if (fc.gx === mc.gx && fc.gy + 1 === mc.gy) {
          isAdjacent = true;
          break;
        }
        // 左から接触
        if (fc.gx + 1 === mc.gx && fc.gy === mc.gy) {
          isAdjacent = true;
          break;
        }
        // 右から接触
        if (fc.gx - 1 === mc.gx && fc.gy === mc.gy) {
          isAdjacent = true;
          break;
        }
      }
      if (isAdjacent) break;
    }

    if (isAdjacent) {
      const relGx = fallGx - playerBaseGx;
      const relGy = fallGy - playerBaseGy;
      this.pieces.push({
        piece: fallingPiece,
        relGx,
        relGy,
      });
      return { docked: true, piece: fallingPiece };
    }

    return { docked: false };
  }

  // ピクセル単位で浮遊しているピースを自機に最も近い有効グリッド位置へスナップ吸着してドッキング
  public tryDockFromPixel(
    piece: TetrominoPiece,
    px: number,
    py: number
  ): { docked: boolean; piece?: TetrominoPiece } {
    const targetGx = Math.round(px / BLOCK_SIZE);
    const targetGy = Math.round(py / BLOCK_SIZE);

    // targetGx, targetGy を中心に ±1 のグリッドを探索して結合可能かチェック
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const testGx = targetGx + dx;
        const testGy = targetGy + dy;

        const res = this.tryDock(piece, testGx, testGy);
        if (res.docked) {
          return res;
        }
      }
    }

    return { docked: false };
  }

  // エクセリオン風・滑らかな慣性移動処理（加速・減速・ドリフト感）
  public updateMovement(
    dt: number,
    inputs: {
      left: boolean;
      right: boolean;
      up: boolean;
      down: boolean;
      mouseX: number | null;
      mouseY: number | null;
      hasMouseMoved: boolean;
    }
  ): void {
    const bounds = this.getBoundingBox();
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;

    // 画面全体が移動可能エリア
    const minScreenX = 0;
    const maxScreenX = CANVAS_WIDTH;
    const minScreenY = 60; // 上部HUD下
    const maxScreenY = CANVAS_HEIGHT - 10;

    const ACCEL = 1400; // 俊敏な立ち上がり加速度
    const MAX_SPEED = PLAYER_SPEED * 1.35; // スピード感のある最高速
    const FRICTION = 0.92; // 離した時の自然で滑らかなスーッと流れる慣性ドリフト

    let inputAx = 0;
    let inputAy = 0;

    if (inputs.left) inputAx -= ACCEL;
    if (inputs.right) inputAx += ACCEL;
    if (inputs.up) inputAy -= ACCEL;
    if (inputs.down) inputAy += ACCEL;

    // マウス操作時はマウス位置へ向かって滑らかに追従加速
    if (inputs.hasMouseMoved && inputs.mouseX !== null && inputs.mouseY !== null) {
      const targetAnchorX = inputs.mouseX - width / 2;
      const targetAnchorY = inputs.mouseY - height / 2;
      const diffX = targetAnchorX - this.anchorX;
      const diffY = targetAnchorY - this.anchorY;
      const dist = Math.hypot(diffX, diffY);

      if (dist > 6) {
        inputAx = (diffX / dist) * ACCEL * 1.3;
        inputAy = (diffY / dist) * ACCEL * 1.3;
      }
    }

    // 加速度適用
    this.vx += inputAx * dt;
    this.vy += inputAy * dt;

    // 入力がない軸は滑らかな指数減衰
    if (inputAx === 0) {
      this.vx *= Math.pow(FRICTION, dt * 60);
      if (Math.abs(this.vx) < 1.0) this.vx = 0;
    }
    if (inputAy === 0) {
      this.vy *= Math.pow(FRICTION, dt * 60);
      if (Math.abs(this.vy) < 1.0) this.vy = 0;
    }

    // 速度制限
    const currentSpeed = Math.hypot(this.vx, this.vy);
    if (currentSpeed > MAX_SPEED) {
      const scale = MAX_SPEED / currentSpeed;
      this.vx *= scale;
      this.vy *= scale;
    }

    // 位置更新（浮動小数点で滑らかに更新）
    this.anchorX += this.vx * dt;
    this.anchorY += this.vy * dt;

    // 画面外境界クランプ（滑らかな当たり）
    const minAnchorX = minScreenX - (bounds.minX - this.anchorX);
    const maxAnchorX = maxScreenX - (bounds.maxX - this.anchorX);
    if (this.anchorX < minAnchorX) {
      this.anchorX = minAnchorX;
      this.vx = 0;
    } else if (this.anchorX > maxAnchorX) {
      this.anchorX = maxAnchorX;
      this.vx = 0;
    }

    const minAnchorY = minScreenY - (bounds.minY - this.anchorY);
    const maxAnchorY = maxScreenY - (bounds.maxY - this.anchorY);
    if (this.anchorY < minAnchorY) {
      this.anchorY = minAnchorY;
      this.vy = 0;
    } else if (this.anchorY > maxAnchorY) {
      this.anchorY = maxAnchorY;
      this.vy = 0;
    }

    if (this.fireCooldown > 0) {
      this.fireCooldown -= dt;
    }

    for (const attached of this.pieces) {
      attached.piece.update(dt);
    }
  }

  // ショット発射処理（1つの銃口につき画面内最大2発制限：ギャラガ・ムーンクレスタ仕様）
  public shootBullets(existingBullets: PlayerBullet[] = []): PlayerBullet[] {
    const bullets: PlayerBullet[] = [];
    const baseGx = Math.round(this.anchorX / BLOCK_SIZE);
    const baseGy = Math.round(this.anchorY / BLOCK_SIZE);

    const occupiedMap = new Set<string>();
    for (const cell of this.getOccupiedCells()) {
      occupiedMap.add(`${cell.gx},${cell.gy}`);
    }

    // 各銃口IDごとの画面内弾数を集計
    const bulletCountPerGun: Record<string, number> = {};
    for (const b of existingBullets) {
      if (!b.isDead && b.gunId) {
        bulletCountPerGun[b.gunId] = (bulletCountPerGun[b.gunId] || 0) + 1;
      }
    }

    for (let pieceIdx = 0; pieceIdx < this.pieces.length; pieceIdx++) {
      const attached = this.pieces[pieceIdx];
      const piece = attached.piece;
      if (piece.type === 'O') continue; // Oブロックは弾が出ない

      for (let portIdx = 0; portIdx < piece.gunPorts.length; portIdx++) {
        const gun = piece.gunPorts[portIdx];
        const sourceGx = baseGx + attached.relGx + gun.cellGx;
        const sourceGy = baseGy + attached.relGy + gun.cellGy;

        const targetGx = sourceGx + gun.dirX;
        const targetGy = sourceGy + gun.dirY;

        // 【塞がり判定】隣が自機の別のブロックで塞がれているか？
        if (occupiedMap.has(`${targetGx},${targetGy}`)) {
          continue;
        }

        // 銃口固有のID（パーツインデックス＋銃口インデックス）
        const gunId = `p${pieceIdx}_g${portIdx}`;
        const currentCount = bulletCountPerGun[gunId] || 0;

        // 画面内2発制限（2発存在している銃口からは新規発射しない）
        if (currentCount >= 2) {
          continue;
        }

        // 自機の滑らかな浮動小数点座標から直接弾を発射（カクつきゼロ）
        const bx = this.anchorX + (attached.relGx + gun.cellGx + 0.5 + gun.dirX * 0.5) * BLOCK_SIZE;
        const by = this.anchorY + (attached.relGy + gun.cellGy + 0.5 + gun.dirY * 0.5) * BLOCK_SIZE;

        bullets.push(new PlayerBullet(bx, by, gun.angle, piece.color, gunId));
        bulletCountPerGun[gunId] = currentCount + 1;
      }
    }

    return bullets;
  }

  // Oミノ（中心コア）から地続き（隣接）になっているかをBFSで検証
  // Oミノから切り離されたパーツを配列で取り出して返す（落下・回収用）
  public checkConnectivity(): AttachedPiece[] {
    // Oミノ（コア）を探す
    const coreIndex = this.pieces.findIndex(p => p.piece.type === 'O');
    if (coreIndex === -1) {
      // Oミノが破壊された＝ゲームオーバー
      this.isDead = true;
      return [];
    }

    // 各ピースが占有するセルの集合
    const pieceCells = this.pieces.map(attached => {
      const set = new Set<string>();
      for (const c of attached.piece.cells) {
        set.add(`${attached.relGx + c.gx},${attached.relGy + c.gy}`);
      }
      return set;
    });

    const n = this.pieces.length;
    // ピース間の隣接グラフを構築
    const adj: number[][] = Array.from({ length: n }, () => []);

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let connected = false;
        for (const c1 of pieceCells[i]) {
          const [x1, y1] = c1.split(',').map(Number);
          const neighbors = [
            `${x1 + 1},${y1}`,
            `${x1 - 1},${y1}`,
            `${x1},${y1 + 1}`,
            `${x1},${y1 - 1}`,
          ];
          for (const nb of neighbors) {
            if (pieceCells[j].has(nb)) {
              connected = true;
              break;
            }
          }
          if (connected) break;
        }
        if (connected) {
          adj[i].push(j);
          adj[j].push(i);
        }
      }
    }

    // BFSでコアから到達可能なピースを探索
    const visited = new Set<number>();
    const queue = [coreIndex];
    visited.add(coreIndex);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const next of adj[curr]) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }

    // 未到達のピースを切り離す
    const remaining: AttachedPiece[] = [];
    const detached: AttachedPiece[] = [];

    for (let i = 0; i < n; i++) {
      if (visited.has(i)) {
        remaining.push(this.pieces[i]);
      } else {
        detached.push(this.pieces[i]);
      }
    }

    this.pieces = remaining;
    return detached;
  }

  // 被弾判定
  public checkHit(
    px: number,
    py: number,
    particles: ParticleManager
  ): { hit: boolean; pieceDestroyed: boolean; pieceType?: TetrominoType; detachedPieces?: AttachedPiece[] } {
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const attached = this.pieces[i];
      const piece = attached.piece;

      for (const cell of piece.cells) {
        const cellX = this.anchorX + (attached.relGx + cell.gx) * BLOCK_SIZE;
        const cellY = this.anchorY + (attached.relGy + cell.gy) * BLOCK_SIZE;

        if (px >= cellX && px < cellX + BLOCK_SIZE && py >= cellY && py < cellY + BLOCK_SIZE) {
          const isDestroyed = piece.hit(1);
          particles.emitSparks(px, py, piece.color, 12);

          if (isDestroyed) {
            particles.emitExplosion(cellX + BLOCK_SIZE / 2, cellY + BLOCK_SIZE / 2, piece.color, 28, true);
            const destroyedType = piece.type;
            this.pieces.splice(i, 1);

            // コア（Oミノ）が破壊された場合、即ゲームオーバー
            if (destroyedType === 'O') {
              this.isDead = true;
              const bounds = this.getBoundingBox();
              const centerX = (bounds.minX + bounds.maxX) / 2 || px;
              const centerY = (bounds.minY + bounds.maxY) / 2 || py;
              particles.emitRetroExplosion(centerX, centerY, 3.2);
              return { hit: true, pieceDestroyed: true, pieceType: destroyedType };
            }

            // 残ったパーツの連結性検証：Oミノから切り離されたパーツは浮遊・落下！
            const detachedPieces = this.checkConnectivity();

            if (this.pieces.length === 0) {
              this.isDead = true;
              const bounds = this.getBoundingBox();
              const centerX = (bounds.minX + bounds.maxX) / 2 || px;
              const centerY = (bounds.minY + bounds.maxY) / 2 || py;
              particles.emitRetroExplosion(centerX, centerY, 2.8);
            }
            return { hit: true, pieceDestroyed: true, pieceType: destroyedType, detachedPieces };
          }

          return { hit: true, pieceDestroyed: false, pieceType: piece.type };
        }
      }
    }

    return { hit: false, pieceDestroyed: false };
  }

  public draw(ctx: CanvasRenderingContext2D): void {
    const baseGx = Math.round(this.anchorX / BLOCK_SIZE);
    const baseGy = Math.round(this.anchorY / BLOCK_SIZE);

    const occupiedMap = new Set<string>();
    for (const cell of this.getOccupiedCells()) {
      occupiedMap.add(`${cell.gx},${cell.gy}`);
    }

    for (const attached of this.pieces) {
      const piece = attached.piece;
      for (const cell of piece.cells) {
        // サブピクセル描画：Math.roundで30pxグリッドに丸めず、浮動小数点位置で完全に滑らかに描画
        const px = this.anchorX + (attached.relGx + cell.gx) * BLOCK_SIZE;
        const py = this.anchorY + (attached.relGy + cell.gy) * BLOCK_SIZE;

        const gun = piece.gunPorts.find(g => g.cellGx === cell.gx && g.cellGy === cell.gy);
        let hasActiveGun = false;
        let activeAngle = 0;

        if (gun) {
          const sourceGx = baseGx + attached.relGx + gun.cellGx;
          const sourceGy = baseGy + attached.relGy + gun.cellGy;
          const targetGx = sourceGx + gun.dirX;
          const targetGy = sourceGy + gun.dirY;

          if (!occupiedMap.has(`${targetGx},${targetGy}`)) {
            hasActiveGun = true;
            activeAngle = gun.angle;
          }
        }

        piece.drawCell(ctx, px, py, undefined, 1.0, hasActiveGun, activeAngle);
      }
    }

    // スラスター炎
    const bounds = this.getBoundingBox();
    const thrusterX = (bounds.minX + bounds.maxX) / 2;
    const thrusterY = bounds.maxY;
    const flameHeight = Math.random() * 9 + 6;

    ctx.save();
    ctx.fillStyle = Math.random() > 0.5 ? '#ff2200' : '#ffea00';
    ctx.beginPath();
    ctx.moveTo(thrusterX - 7, thrusterY);
    ctx.lineTo(thrusterX + 7, thrusterY);
    ctx.lineTo(thrusterX, thrusterY + flameHeight);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
