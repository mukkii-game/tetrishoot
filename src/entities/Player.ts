import { BLOCK_SIZE, CANVAS_WIDTH, LEFT_WALL_COL, PLAYER_INITIAL_Y, PLAYER_SPEED, RIGHT_WALL_COL } from '../config';
import { ParticleManager } from '../effects/Particle';
import { PlayerBullet } from './Bullet';
import { TetrominoPiece, TetrominoType } from './Tetromino';
import { WallManager } from './Wall';

export interface AttachedPiece {
  piece: TetrominoPiece;
  relGx: number; // 自機アンカーセル(0,0)に対する相対グリッドX
  relGy: number; // 自機アンカーセル(0,0)に対する相対グリッドY
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

  // 初期の自機：Oミノ（正方形2x2）
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
  public getOccupiedCells(): { gx: number; gy: number; piece: TetrominoPiece; pieceRelX: number; pieceRelY: number }[] {
    const baseGx = Math.round(this.anchorX / BLOCK_SIZE);
    const baseGy = Math.round(this.anchorY / BLOCK_SIZE);
    const cells: { gx: number; gy: number; piece: TetrominoPiece; pieceRelX: number; pieceRelY: number }[] = [];

    for (const attached of this.pieces) {
      for (const c of attached.piece.cells) {
        cells.push({
          gx: baseGx + attached.relGx + c.gx,
          gy: baseGy + attached.relGy + c.gy,
          piece: attached.piece,
          pieceRelX: (attached.relGx + c.gx) * BLOCK_SIZE,
          pieceRelY: (attached.relGy + c.gy) * BLOCK_SIZE,
        });
      }
    }
    return cells;
  }

  // 自機の左右バウンディングボックス（ピクセル単位）
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

  // 落下中のミノが自機とドッキング可能か判定して結合
  public tryDock(
    fallingPiece: TetrominoPiece,
    fallPx: number,
    fallPy: number
  ): { docked: boolean; piece?: TetrominoPiece } {
    const playerBaseGx = Math.round(this.anchorX / BLOCK_SIZE);
    const playerBaseGy = Math.round(this.anchorY / BLOCK_SIZE);

    const fallGx = Math.round(fallPx / BLOCK_SIZE);
    const fallGy = Math.round(fallPy / BLOCK_SIZE);

    // 落下ミノの各セルのグリッド絶対座標
    const fallingAbsoluteCells = fallingPiece.cells.map(c => ({
      gx: fallGx + c.gx,
      gy: fallGy + c.gy,
    }));

    // 自機の各セルの絶対グリッド座標
    const myCells = this.getOccupiedCells();

    // 重なりがあるかチェック
    for (const fc of fallingAbsoluteCells) {
      for (const mc of myCells) {
        if (fc.gx === mc.gx && fc.gy === mc.gy) {
          // すでに重なっている場合は結合不可（スナップのズレ）
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

  // 移動処理（壁コリジョン考慮）
  public updateMovement(
    dt: number,
    inputs: { left: boolean; right: boolean; mouseX: number | null; hasMouseMoved: boolean },
    wallManager: WallManager
  ): void {
    const bounds = this.getBoundingBox();
    const width = bounds.maxX - bounds.minX;
    const minWallX = (LEFT_WALL_COL + 1) * BLOCK_SIZE;
    const maxWallX = RIGHT_WALL_COL * BLOCK_SIZE;

    let moveDelta = 0;

    if (inputs.hasMouseMoved && inputs.mouseX !== null) {
      // マウス操作：中心位置に追従
      const targetAnchorX = inputs.mouseX - width / 2;
      const diff = targetAnchorX - this.anchorX;
      moveDelta = Math.sign(diff) * Math.min(Math.abs(diff), PLAYER_SPEED * 1.5 * dt);
    } else {
      // キーボード操作
      if (inputs.left) {
        moveDelta -= PLAYER_SPEED * dt;
      }
      if (inputs.right) {
        moveDelta += PLAYER_SPEED * dt;
      }
    }

    if (moveDelta !== 0) {
      const nextAnchorX = this.anchorX + moveDelta;
      const nextMinX = nextAnchorX + (bounds.minX - this.anchorX);
      const nextMaxX = nextAnchorX + (bounds.maxX - this.anchorX);

      // 画面左右端の壁判定
      if (nextMinX >= minWallX && nextMaxX <= maxWallX) {
        // 壁防壁との詳細衝突判定
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

    if (this.fireCooldown > 0) {
      this.fireCooldown -= dt;
    }

    // パーツ更新
    for (const attached of this.pieces) {
      attached.piece.update(dt);
    }
  }

  // ショット発射処理
  public shootBullets(): PlayerBullet[] {
    const bullets: PlayerBullet[] = [];
    const baseGx = Math.round(this.anchorX / BLOCK_SIZE);
    const baseGy = Math.round(this.anchorY / BLOCK_SIZE);

    for (const attached of this.pieces) {
      const piece = attached.piece;
      if (piece.type === 'O') continue; // Oミノは弾が出ない

      const piecePx = (baseGx + attached.relGx) * BLOCK_SIZE;
      const piecePy = (baseGy + attached.relGy) * BLOCK_SIZE;

      for (const gun of piece.gunPorts) {
        const bx = piecePx + gun.relX;
        const by = piecePy + gun.relY;
        const angle = -Math.PI / 2 + gun.angleOffset;
        bullets.push(new PlayerBullet(bx, by, angle, piece.color));
      }
    }

    return bullets;
  }

  // 被弾判定：(px, py) が自機のどのパーツに当たったかを判定
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
          // パーツにヒット！
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

  public draw(ctx: CanvasRenderingContext2D): void {
    const baseGx = Math.round(this.anchorX / BLOCK_SIZE);
    const baseGy = Math.round(this.anchorY / BLOCK_SIZE);

    for (const attached of this.pieces) {
      const piece = attached.piece;
      for (const cell of piece.cells) {
        const px = (baseGx + attached.relGx + cell.gx) * BLOCK_SIZE;
        const py = (baseGy + attached.relGy + cell.gy) * BLOCK_SIZE;
        piece.drawCell(ctx, px, py);
      }
    }

    // ギャラガ風スラスター噴射アニメーション（底部）
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
