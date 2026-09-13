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
  public barrierTimer = 0;
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

  // 浮遊ミノが自機に結合可能な最良のグリッド候補（最短距離かつ適切な接合面）を探索
  public findBestDockCandidate(
    piece: TetrominoPiece,
    px: number,
    py: number
  ): {
    relGx: number;
    relGy: number;
    candPx: number;
    candPy: number;
    dist: number;
    effectiveDist: number;
    contactTop: number;
    totalContacts: number;
  } | null {
    const floatRelGx = (px - this.anchorX) / BLOCK_SIZE;
    const floatRelGy = (py - this.anchorY) / BLOCK_SIZE;
    const approxRelGx = Math.round(floatRelGx);
    const approxRelGy = Math.round(floatRelGy);

    const myCells: { relGx: number; relGy: number }[] = [];
    for (const attached of this.pieces) {
      for (const c of attached.piece.cells) {
        myCells.push({
          relGx: attached.relGx + c.gx,
          relGy: attached.relGy + c.gy,
        });
      }
    }

    if (myCells.length === 0) return null;

    let bestCandidate: {
      relGx: number;
      relGy: number;
      candPx: number;
      candPy: number;
      dist: number;
      effectiveDist: number;
      contactTop: number;
      totalContacts: number;
    } | null = null;
    let minEffectiveDist = Infinity;

    // approxRelGx, approxRelGy を中心に ±2 の相対グリッド範囲を網羅探索
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const testRelGx = approxRelGx + dx;
        const testRelGy = approxRelGy + dy;

        // 候補の各セル座標
        const testCells = piece.cells.map(c => ({
          relGx: testRelGx + c.gx,
          relGy: testRelGy + c.gy,
        }));

        // 1. 重なりチェック（1マスでも自機既存セルと被っていれば無効）
        let overlaps = false;
        for (const tc of testCells) {
          for (const mc of myCells) {
            if (tc.relGx === mc.relGx && tc.relGy === mc.relGy) {
              overlaps = true;
              break;
            }
          }
          if (overlaps) break;
        }
        if (overlaps) continue;

        // 2. 接合面（隣接）チェック
        let contactTop = 0; // ミノが自機の上に乗る面（降下ドッキングで最優先）
        let contactSide = 0; // ミノが自機の左右に接する面
        let contactBottom = 0; // ミノが自機の下に接する面

        for (const tc of testCells) {
          for (const mc of myCells) {
            // tc の底面が mc の上面に接している（tc が上に乗る）
            if (tc.relGx === mc.relGx && tc.relGy + 1 === mc.relGy) {
              contactTop++;
            }
            // tc の側面が mc に接している
            else if (tc.relGy === mc.relGy && (tc.relGx + 1 === mc.relGx || tc.relGx - 1 === mc.relGx)) {
              contactSide++;
            }
            // tc の上面が mc の下面に接している（tc が下にある）
            else if (tc.relGx === mc.relGx && tc.relGy - 1 === mc.relGy) {
              contactBottom++;
            }
          }
        }

        const totalContacts = contactTop + contactSide + contactBottom;
        if (totalContacts === 0) continue; // どこにも接していない

        // 3. ピクセル実距離の計算（自機の現在位置基準）
        const candPx = this.anchorX + testRelGx * BLOCK_SIZE;
        const candPy = this.anchorY + testRelGy * BLOCK_SIZE;
        const dist = Math.hypot(px - candPx, py - candPy);

        // 4. 有効距離スコア（上部着地優先＆接合面積ボーナス）
        let effectiveDist = dist;
        if (contactTop > 0) {
          effectiveDist -= 10; // 上部着地を最優先
        }
        effectiveDist -= totalContacts * 2; // ガッチリ噛み合う配置を優先
        if (contactBottom > 0 && contactTop === 0) {
          effectiveDist += 24; // 下からの不自然な吸着を防止
        }

        if (effectiveDist < minEffectiveDist) {
          minEffectiveDist = effectiveDist;
          bestCandidate = {
            relGx: testRelGx,
            relGy: testRelGy,
            candPx,
            candPy,
            dist,
            effectiveDist,
            contactTop,
            totalContacts,
          };
        }
      }
    }

    return bestCandidate;
  }

  // 落下中のミノが自機と接触しているか判定し、結合確定（互換用）
  public tryDock(
    fallingPiece: TetrominoPiece,
    fallGx: number,
    fallGy: number
  ): { docked: boolean; piece?: TetrominoPiece } {
    return this.tryDockFromPixel(fallingPiece, fallGx * BLOCK_SIZE, fallGy * BLOCK_SIZE);
  }

  // ピクセル単位で浮遊しているピースを自機に最も近い有効グリッド位置へスナップ吸着してドッキング
  public tryDockFromPixel(
    piece: TetrominoPiece,
    px: number,
    py: number,
    maxSnapDistance: number = BLOCK_SIZE * 1.15
  ): { docked: boolean; piece?: TetrominoPiece } {
    const best = this.findBestDockCandidate(piece, px, py);
    if (!best) {
      return { docked: false };
    }

    // 許容距離内（十分に接近して合体体制にある）場合のみ結合
    if (best.dist <= maxSnapDistance) {
      this.pieces.push({
        piece,
        relGx: best.relGx,
        relGy: best.relGy,
      });
      return { docked: true, piece };
    }

    return { docked: false };
  }

  // ドッキング予定位置のゴースト描画
  public drawDockGhost(
    ctx: CanvasRenderingContext2D,
    piece: TetrominoPiece,
    relGx: number,
    relGy: number
  ): void {
    ctx.save();
    const pulse = 0.45 + Math.sin(Date.now() / 120) * 0.2;
    ctx.globalAlpha = Math.max(0.2, Math.min(0.85, pulse));
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);

    for (const cell of piece.cells) {
      const px = this.anchorX + (relGx + cell.gx) * BLOCK_SIZE;
      const py = this.anchorY + (relGy + cell.gy) * BLOCK_SIZE;

      ctx.fillStyle = piece.color;
      ctx.fillRect(px + 1, py + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
      ctx.strokeRect(px, py, BLOCK_SIZE, BLOCK_SIZE);
    }

    ctx.restore();
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

    // 画面全体が移動可能エリア
    const minScreenX = 0;
    const maxScreenX = CANVAS_WIDTH;
    const minScreenY = 60; // 上部HUD下
    const maxScreenY = CANVAS_HEIGHT - 10;

    // ユーザー要望：慣性移動を一旦止めて、ピタッと止まるダイレクト操作へ
    this.vx = 0;
    this.vy = 0;

    if (inputs.left) this.vx -= PLAYER_SPEED;
    if (inputs.right) this.vx += PLAYER_SPEED;
    if (inputs.up) this.vy -= PLAYER_SPEED;
    if (inputs.down) this.vy += PLAYER_SPEED;

    // 斜め移動時の等速化
    if (this.vx !== 0 && this.vy !== 0) {
      this.vx *= 0.7071;
      this.vy *= 0.7071;
    }

    // ユーザー要望：マウス移動による自機操作はカット（キーボード操作に専念、マウスの意図しない介入を防止）
    // 位置更新（即時停止・ブレなし）
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

    if (this.barrierTimer > 0) {
      this.barrierTimer -= dt;
    }

    for (const attached of this.pieces) {
      attached.piece.update(dt);
    }
  }

  // 自機のパーツがOミノ（コア）のみになっているか判定
  public isOnlyOMino(): boolean {
    return !this.isDead && this.pieces.length > 0 && this.pieces.every(p => p.piece.type === 'O');
  }

  // ショット発射処理（1つの銃口につき画面内最大2発制限：ギャラガ・ムーンクレスタ仕様）
  public shootBullets(existingBullets: PlayerBullet[] = []): PlayerBullet[] {
    const bullets: PlayerBullet[] = [];
    const baseGx = Math.round(this.anchorX / BLOCK_SIZE);
    const baseGy = Math.round(this.anchorY / BLOCK_SIZE);

    // ★ ユーザー要望：Oミノだけになった時は画面内1発制限で発射
    if (this.isOnlyOMino()) {
      const emergencyCount = existingBullets.filter(b => !b.isDead && b.gunId === 'o_core_emergency').length;
      if (emergencyCount < 1) {
        const bx = this.anchorX + BLOCK_SIZE;
        const by = this.anchorY;
        bullets.push(new PlayerBullet(bx, by, -Math.PI / 2, '#ffea00', 'o_core_emergency'));
      }
      return bullets;
    }

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
      if (piece.type === 'O') continue; // 通常はOブロック自体からは弾が出ない

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

        // 銃口固有のID（各ピースのユニークID＋銃口インデックスで確実に1銃口あたり2発管理）
        const gunId = `${piece.id}_g${portIdx}`;
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
  // ユーザー新ルール：自機はOミノが本体。もしOミノが2つ以上あったら、Oミノが0にならない限り死なない。
  // Oミノから切り離されたパーツを配列で取り出して返す（落下・回収用）
  public checkConnectivity(): AttachedPiece[] {
    // すべてのOミノ（コア）のインデックスを取得
    const coreIndices: number[] = [];
    for (let i = 0; i < this.pieces.length; i++) {
      if (this.pieces[i].piece.type === 'O') {
        coreIndices.push(i);
      }
    }

    if (coreIndices.length === 0) {
      // すべてのOミノが破壊された＝ゲームオーバー
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

    // BFSですべてのOミノから到達可能なピースをマーク（マルチコア地続き探索）
    const visited = new Set<number>();
    const queue: number[] = [];
    for (const ci of coreIndices) {
      visited.add(ci);
      queue.push(ci);
    }

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
    // バリア稼働中は完全無敵（体当たり・弾を弾き返す）
    if (this.barrierTimer > 0) {
      particles.emitSparks(px, py, '#00ffff', 8);
      return { hit: false, pieceDestroyed: false };
    }

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

            // 残っているOミノの数をカウント
            const remainingOCount = this.pieces.filter(p => p.piece.type === 'O').length;

            // Oミノが0個になった場合のみ、ゲームオーバー！
            if (remainingOCount === 0) {
              this.isDead = true;
              const bounds = this.getBoundingBox();
              const centerX = (bounds.minX + bounds.maxX) / 2 || px;
              const centerY = (bounds.minY + bounds.maxY) / 2 || py;
              particles.emitRetroExplosion(centerX, centerY, 3.2);
              return { hit: true, pieceDestroyed: true, pieceType: destroyedType };
            }

            // まだOミノが残っていれば生存！Oミノ群から切り離されたパーツを浮遊・回収へ
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

    // バリアシールドリング描画（回転ネオンリング＋プラズマ粒子）
    if (this.barrierTimer > 0) {
      ctx.save();
      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerY = (bounds.minY + bounds.maxY) / 2;
      const radius = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.75 + 14;

      const t = Date.now() / 150;
      const hue = Math.floor((t * 60) % 360);

      ctx.translate(centerX, centerY);
      ctx.rotate(t * 0.8);

      ctx.strokeStyle = `hsl(${hue}, 100%, 65%)`;
      ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;
      ctx.shadowBlur = 16;
      ctx.lineWidth = 3.5;

      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();

      // 内側の逆回転点線リング
      ctx.rotate(-t * 1.6);
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash([8, 8]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, radius - 6, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }
  }
}
