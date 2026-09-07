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
  public pieces: AttachedPiece[] = [];
  public fireCooldown = 0;
  public isDead = false;

  constructor() {
    this.anchorX = Math.floor(CANVAS_WIDTH / 2 - BLOCK_SIZE);
    this.anchorY = PLAYER_INITIAL_Y;
    this.initInitialPiece();
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

  // 上下左右（全方向）移動処理（左右の壁撤廃、画面端までオープンに動ける！）
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

    // 画面全体が移動可能エリア！
    const minScreenX = 0;
    const maxScreenX = CANVAS_WIDTH;
    const minScreenY = 60; // 上部HUD下
    const maxScreenY = CANVAS_HEIGHT - 10;

    let deltaX = 0;
    let deltaY = 0;

    if (inputs.hasMouseMoved && inputs.mouseX !== null && inputs.mouseY !== null) {
      const targetAnchorX = inputs.mouseX - width / 2;
      const targetAnchorY = inputs.mouseY - height / 2;
      const diffX = targetAnchorX - this.anchorX;
      const diffY = targetAnchorY - this.anchorY;

      deltaX = Math.sign(diffX) * Math.min(Math.abs(diffX), PLAYER_SPEED * 1.6 * dt);
      deltaY = Math.sign(diffY) * Math.min(Math.abs(diffY), PLAYER_SPEED * 1.6 * dt);
    } else {
      if (inputs.left) deltaX -= PLAYER_SPEED * dt;
      if (inputs.right) deltaX += PLAYER_SPEED * dt;
      if (inputs.up) deltaY -= PLAYER_SPEED * dt;
      if (inputs.down) deltaY += PLAYER_SPEED * dt;
    }

    // X軸移動
    if (deltaX !== 0) {
      const nextAnchorX = this.anchorX + deltaX;
      const nextMinX = nextAnchorX + (bounds.minX - this.anchorX);
      const nextMaxX = nextAnchorX + (bounds.maxX - this.anchorX);

      if (nextMinX >= minScreenX && nextMaxX <= maxScreenX) {
        this.anchorX = nextAnchorX;
      }
    }

    // Y軸移動
    if (deltaY !== 0) {
      const nextAnchorY = this.anchorY + deltaY;
      const nextMinY = nextAnchorY + (bounds.minY - this.anchorY);
      const nextMaxY = nextAnchorY + (bounds.maxY - this.anchorY);

      if (nextMinY >= minScreenY && nextMaxY <= maxScreenY) {
        this.anchorY = nextAnchorY;
      }
    }

    if (this.fireCooldown > 0) {
      this.fireCooldown -= dt;
    }

    for (const attached of this.pieces) {
      attached.piece.update(dt);
    }
  }

  // ショット発射処理（塞がり判定付き全方向ビーム）
  public shootBullets(): PlayerBullet[] {
    const bullets: PlayerBullet[] = [];
    const baseGx = Math.round(this.anchorX / BLOCK_SIZE);
    const baseGy = Math.round(this.anchorY / BLOCK_SIZE);

    const occupiedMap = new Set<string>();
    for (const cell of this.getOccupiedCells()) {
      occupiedMap.add(`${cell.gx},${cell.gy}`);
    }

    for (const attached of this.pieces) {
      const piece = attached.piece;
      if (piece.type === 'O') continue; // Oブロックは弾が出ない

      for (const gun of piece.gunPorts) {
        const sourceGx = baseGx + attached.relGx + gun.cellGx;
        const sourceGy = baseGy + attached.relGy + gun.cellGy;

        const targetGx = sourceGx + gun.dirX;
        const targetGy = sourceGy + gun.dirY;

        // 【塞がり判定】隣が自機の別のブロックで塞がれているか？
        if (occupiedMap.has(`${targetGx},${targetGy}`)) {
          continue;
        }

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
          particles.emitSparks(px, py, piece.color, 12);

          if (isDestroyed) {
            particles.emitExplosion(cellX + BLOCK_SIZE / 2, cellY + BLOCK_SIZE / 2, piece.color, 28, true);
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
        const px = (baseGx + attached.relGx + cell.gx) * BLOCK_SIZE;
        const py = (baseGy + attached.relGy + cell.gy) * BLOCK_SIZE;

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
