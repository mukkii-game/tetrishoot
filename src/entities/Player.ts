import { BLOCK_SIZE, CANVAS_HEIGHT, CANVAS_WIDTH, LEFT_WALL_COL, PLAYER_INITIAL_Y, PLAYER_SPEED, RIGHT_WALL_COL } from '../config';
import { ParticleManager } from '../effects/Particle';
import { PlayerBullet } from './Bullet';
import { TetrominoPiece, TetrominoType } from './Tetromino';
import { WallManager } from './Wall';

export interface AttachedPiece {
  piece: TetrominoPiece;
  relGx: number; // 自機アンカーに対する相対グリッドX
  relGy: number; // 自機アンカーに対する相対グリッドY
}

export class Player {
  public anchorX: number; // 自機の基準ピクセルX（グリッドの基準点）
  public anchorY: number; // 自機の基準ピクセルY
  public pieces: AttachedPiece[] = [];
  public fireCooldown = 0;
  public isDead = false;

  constructor() {
    this.anchorX = Math.floor(CANVAS_WIDTH / 2 - BLOCK_SIZE);
    this.anchorY = PLAYER_INITIAL_Y;
    this.initInitialPiece();
  }

  // 初期の自機：Oミノ（正方形2x2、端点なし＝弾なし）
  public initInitialPiece(): void {
    this.pieces = [];
    const oPiece = new TetrominoPiece('O');
    this.pieces.push({
      piece: oPiece,
      relGx: 0,
      relGy: 0,
    });
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

  // 落下中のミノ（fallGx, fallGy）が自機と接触しているか判定し、結合確定
  public tryDock(
    fallingPiece: TetrominoPiece,
    fallGx: number,
    fallGy: number
  ): { docked: boolean; piece?: TetrominoPiece } {
    const playerBaseGx = Math.round(this.anchorX / BLOCK_SIZE);
    const playerBaseGy = Math.round(this.anchorY / BLOCK_SIZE);

    // 落下ミノの各セルのグリッド絶対座標
    const fallingAbsoluteCells = fallingPiece.cells.map(c => ({
      gx: fallGx + c.gx,
      gy: fallGy + c.gy,
    }));

    const myCells = this.getOccupiedCells();

    // すでに重なっている場合は結合不可
    for (const fc of fallingAbsoluteCells) {
      for (const mc of myCells) {
        if (fc.gx === mc.gx && fc.gy === mc.gy) {
          return { docked: false };
        }
      }
    }

    // 上から、または左右からの接触があるかを判定
    let isAdjacent = false;
    for (const fc of fallingAbsoluteCells) {
      for (const mc of myCells) {
        // 上から接触（落下セルの下が自機セル）
        if (fc.gx === mc.gx && fc.gy + 1 === mc.gy) {
          isAdjacent = true;
          break;
        }
        // 左から接触（落下セルの右が自機セル）
        if (fc.gx + 1 === mc.gx && fc.gy === mc.gy) {
          isAdjacent = true;
          break;
        }
        // 右から接触（落下セルの左が自機セル）
        if (fc.gx - 1 === mc.gx && fc.gy === mc.gy) {
          isAdjacent = true;
          break;
        }
      }
      if (isAdjacent) break;
    }

    if (isAdjacent) {
      // 自機のアンカー相対セル座標を計算してドッキング！
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

  // 移動処理（シューティングタイム用：上下左右に移動可能！）
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
    },
    wallManager: WallManager
  ): void {
    const bounds = this.getBoundingBox();
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;

    const minWallX = (LEFT_WALL_COL + 1) * BLOCK_SIZE;
    const maxWallX = RIGHT_WALL_COL * BLOCK_SIZE;
    const minMovableY = 80; // HUDの下
    const maxMovableY = CANVAS_HEIGHT - 20;

    let deltaX = 0;
    let deltaY = 0;

    if (inputs.hasMouseMoved && inputs.mouseX !== null && inputs.mouseY !== null) {
      // マウス操作（目標中心位置へスムーズに追従）
      const targetAnchorX = inputs.mouseX - width / 2;
      const targetAnchorY = inputs.mouseY - height / 2;
      const diffX = targetAnchorX - this.anchorX;
      const diffY = targetAnchorY - this.anchorY;

      deltaX = Math.sign(diffX) * Math.min(Math.abs(diffX), PLAYER_SPEED * 1.5 * dt);
      deltaY = Math.sign(diffY) * Math.min(Math.abs(diffY), PLAYER_SPEED * 1.5 * dt);
    } else {
      // キーボード操作（上下左右）
      if (inputs.left) deltaX -= PLAYER_SPEED * dt;
      if (inputs.right) deltaX += PLAYER_SPEED * dt;
      if (inputs.up) deltaY -= PLAYER_SPEED * dt;
      if (inputs.down) deltaY += PLAYER_SPEED * dt;
    }

    // X軸の移動と衝突判定
    if (deltaX !== 0) {
      const nextAnchorX = this.anchorX + deltaX;
      const nextMinX = nextAnchorX + (bounds.minX - this.anchorX);
      const nextMaxX = nextAnchorX + (bounds.maxX - this.anchorX);

      if (nextMinX >= minWallX && nextMaxX <= maxWallX) {
        let collides = false;
        const testBaseGx = Math.round(nextAnchorX / BLOCK_SIZE);
        const testBaseGy = Math.round(this.anchorY / BLOCK_SIZE);

        for (const attached of this.pieces) {
          for (const c of attached.piece.cells) {
            const gx = testBaseGx + attached.relGx + c.gx;
            const gy = testBaseGy + attached.relGy + c.gy;
            if (wallManager.hasBlock(gx, gy)) {
              collides = true;
              break;
            }
          }
          if (collides) break;
        }

        if (!collides) {
          this.anchorX = nextAnchorX;
        }
      }
    }

    // Y軸の移動と衝突判定（上下移動）
    if (deltaY !== 0) {
      const nextAnchorY = this.anchorY + deltaY;
      const nextMinY = nextAnchorY + (bounds.minY - this.anchorY);
      const nextMaxY = nextAnchorY + (bounds.maxY - this.anchorY);

      if (nextMinY >= minMovableY && nextMaxY <= maxMovableY) {
        let collides = false;
        const testBaseGx = Math.round(this.anchorX / BLOCK_SIZE);
        const testBaseGy = Math.round(nextAnchorY / BLOCK_SIZE);

        for (const attached of this.pieces) {
          for (const c of attached.piece.cells) {
            const gx = testBaseGx + attached.relGx + c.gx;
            const gy = testBaseGy + attached.relGy + c.gy;
            if (wallManager.hasBlock(gx, gy)) {
              collides = true;
              break;
            }
          }
          if (collides) break;
        }

        if (!collides) {
          this.anchorY = nextAnchorY;
        }
      }
    }

    if (this.fireCooldown > 0) {
      this.fireCooldown -= dt;
    }

    for (const attached of this.pieces) {
      attached.piece.update(dt);
    }
  }

  // ショット発射処理（塞がり判定＆全方向ビーム）
  public shootBullets(wallManager: WallManager): PlayerBullet[] {
    const bullets: PlayerBullet[] = [];
    const baseGx = Math.round(this.anchorX / BLOCK_SIZE);
    const baseGy = Math.round(this.anchorY / BLOCK_SIZE);

    const occupiedMap = new Set<string>();
    for (const cell of this.getOccupiedCells()) {
      occupiedMap.add(`${cell.gx},${cell.gy}`);
    }

    for (const attached of this.pieces) {
      const piece = attached.piece;
      if (piece.type === 'O') continue; // Oミノは弾が出ない

      for (const gun of piece.gunPorts) {
        const sourceGx = baseGx + attached.relGx + gun.cellGx;
        const sourceGy = baseGy + attached.relGy + gun.cellGy;

        const targetGx = sourceGx + gun.dirX;
        const targetGy = sourceGy + gun.dirY;

        // 【塞がり判定】隣が自機の別のブロックで塞がれているか？
        if (occupiedMap.has(`${targetGx},${targetGy}`)) {
          continue;
        }

        // 壁ブロックで塞がれているか？
        if (wallManager.hasBlock(targetGx, targetGy)) {
          continue;
        }

        // 塞がれていないので発射！
        const bx = (sourceGx + 0.5 + gun.dirX * 0.5) * BLOCK_SIZE;
        const by = (sourceGy + 0.5 + gun.dirY * 0.5) * BLOCK_SIZE;

        bullets.push(new PlayerBullet(bx, by, gun.angle, piece.color));
      }
    }

    return bullets;
  }

  // 被弾判定
  public checkHit(
    px: number,
    py: number,
    particles: ParticleManager
  ): { hit: boolean; pieceDestroyed: boolean; pieceType?: TetrominoType } {
    const baseGx = Math.round(this.anchorX / BLOCK_SIZE);
    const baseGy = Math.round(this.anchorY / BLOCK_SIZE);

    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const attached = this.pieces[i];
      const piece = attached.piece;

      for (const cell of piece.cells) {
        const cellX = (baseGx + attached.relGx + cell.gx) * BLOCK_SIZE;
        const cellY = (baseGy + attached.relGy + cell.gy) * BLOCK_SIZE;

        if (px >= cellX && px < cellX + BLOCK_SIZE && py >= cellY && py < cellY + BLOCK_SIZE) {
          const isDestroyed = piece.hit(1);
          particles.emitSparks(px, py, piece.color, 10);

          if (isDestroyed) {
            particles.emitExplosion(cellX + BLOCK_SIZE / 2, cellY + BLOCK_SIZE / 2, piece.color, 24, true);
            const destroyedType = piece.type;
            this.pieces.splice(i, 1);

            if (this.pieces.length === 0) {
              this.isDead = true;
            }
            return { hit: true, pieceDestroyed: true, pieceType: destroyedType };
          }

          return { hit: true, pieceDestroyed: false, pieceType: piece.type };
        }
      }
    }

    return { hit: false, pieceDestroyed: false };
  }

  public draw(ctx: CanvasRenderingContext2D, wallManager?: WallManager): void {
    const baseGx = Math.round(this.anchorX / BLOCK_SIZE);
    const baseGy = Math.round(this.anchorY / BLOCK_SIZE);

    const occupiedMap = new Set<string>();
    for (const cell of this.getOccupiedCells()) {
      occupiedMap.add(`${cell.gx},${cell.gy}`);
    }

    for (const attached of this.pieces) {
      const piece = attached.piece;
      for (const cell of piece.cells) {
        const px = (baseGx + attached.relGx + cell.gx) * BLOCK_SIZE;
        const py = (baseGy + attached.relGy + cell.gy) * BLOCK_SIZE;

        const gun = piece.gunPorts.find(g => g.cellGx === cell.gx && g.cellGy === cell.gy);
        let hasActiveGun = false;
        let activeAngle = 0;

        if (gun && wallManager) {
          const sourceGx = baseGx + attached.relGx + gun.cellGx;
          const sourceGy = baseGy + attached.relGy + gun.cellGy;
          const targetGx = sourceGx + gun.dirX;
          const targetGy = sourceGy + gun.dirY;

          if (!occupiedMap.has(`${targetGx},${targetGy}`) && !wallManager.hasBlock(targetGx, targetGy)) {
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
    const flameHeight = Math.random() * 8 + 6;

    ctx.save();
    ctx.fillStyle = Math.random() > 0.5 ? '#ff3300' : '#ffcc00';
    ctx.beginPath();
    ctx.moveTo(thrusterX - 6, thrusterY);
    ctx.lineTo(thrusterX + 6, thrusterY);
    ctx.lineTo(thrusterX, thrusterY + flameHeight);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
