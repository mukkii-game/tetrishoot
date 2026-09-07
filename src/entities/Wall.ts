import { BLOCK_SIZE, GRID_COLS, GRID_ROWS, LEFT_WALL_COL, RIGHT_WALL_COL, WALL_PIECE_MAX_HP } from '../config';
import { TetrominoPiece } from './Tetromino';

export interface WallBlock {
  gx: number;
  gy: number;
  isBaseWall: boolean; // 左右端の初期永久壁
  pieceRef?: TetrominoPiece; // 壁にくっついたミノの参照
  hp: number;
}

export class WallManager {
  // グリッド座標 (gx, gy) のブロックマップ
  private grid: Map<string, WallBlock> = new Map();
  public attachedPieces: TetrominoPiece[] = [];

  constructor() {
    this.initBaseWalls();
  }

  // 画面左右端の基本壁を生成
  public initBaseWalls(): void {
    this.grid.clear();
    this.attachedPieces = [];

    for (let gy = 0; gy < GRID_ROWS; gy++) {
      // 左壁
      this.grid.set(`${LEFT_WALL_COL},${gy}`, {
        gx: LEFT_WALL_COL,
        gy,
        isBaseWall: true,
        hp: 9999,
      });
      // 右壁
      this.grid.set(`${RIGHT_WALL_COL},${gy}`, {
        gx: RIGHT_WALL_COL,
        gy,
        isBaseWall: true,
        hp: 9999,
      });
    }
  }

  // 壁ブロックがあるか？
  public hasBlock(gx: number, gy: number): boolean {
    return this.grid.has(`${gx},${gy}`);
  }

  public getBlock(gx: number, gy: number): WallBlock | undefined {
    return this.grid.get(`${gx},${gy}`);
  }

  // ミノを壁にくっつける（防壁化）
  public attachPiece(piece: TetrominoPiece, baseGx: number, baseGy: number): void {
    piece.maxHp = WALL_PIECE_MAX_HP;
    piece.hp = WALL_PIECE_MAX_HP;
    this.attachedPieces.push(piece);

    for (const cell of piece.cells) {
      const gx = baseGx + cell.gx;
      const gy = baseGy + cell.gy;
      if (gx >= 0 && gx < GRID_COLS && gy >= 0 && gy < GRID_ROWS) {
        this.grid.set(`${gx},${gy}`, {
          gx,
          gy,
          isBaseWall: false,
          pieceRef: piece,
          hp: piece.hp,
        });
      }
    }
  }

  // 壁防壁へのダメージ判定
  public damageAt(gx: number, gy: number, damage = 1): { hit: boolean; destroyed: boolean; piece?: TetrominoPiece } {
    const key = `${gx},${gy}`;
    const block = this.grid.get(key);
    if (!block) return { hit: false, destroyed: false };

    if (block.isBaseWall) {
      // 基本壁は無敵
      return { hit: true, destroyed: false };
    }

    if (block.pieceRef) {
      const isDead = block.pieceRef.hit(damage);
      if (isDead) {
        // このミノに属するすべてのセルを壁グリッドから削除
        const piece = block.pieceRef;
        this.removePiece(piece);
        return { hit: true, destroyed: true, piece };
      }
      return { hit: true, destroyed: false, piece: block.pieceRef };
    }

    return { hit: true, destroyed: false };
  }

  private removePiece(piece: TetrominoPiece): void {
    const idx = this.attachedPieces.indexOf(piece);
    if (idx !== -1) {
      this.attachedPieces.splice(idx, 1);
    }
    for (const [key, block] of this.grid.entries()) {
      if (block.pieceRef === piece) {
        this.grid.delete(key);
      }
    }
  }

  // ピクセル座標 (px, py) が壁（基本壁＋防壁ミノ）と衝突しているか
  public checkPointCollision(px: number, py: number): boolean {
    const gx = Math.floor(px / BLOCK_SIZE);
    const gy = Math.floor(py / BLOCK_SIZE);
    return this.hasBlock(gx, gy);
  }

  // 矩形バウンディングボックスが壁と衝突しているか
  public checkRectCollision(x: number, y: number, w: number, h: number): boolean {
    const minGx = Math.floor(x / BLOCK_SIZE);
    const maxGx = Math.floor((x + w - 1) / BLOCK_SIZE);
    const minGy = Math.floor(y / BLOCK_SIZE);
    const maxGy = Math.floor((y + h - 1) / BLOCK_SIZE);

    for (let gy = minGy; gy <= maxGy; gy++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        if (this.hasBlock(gx, gy)) {
          return true;
        }
      }
    }
    return false;
  }

  public update(dt: number): void {
    for (const p of this.attachedPieces) {
      p.update(dt);
    }
  }

  public draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    // 基本壁の描画（重厚なメタルストライプ柄）
    for (let gy = 0; gy < GRID_ROWS; gy++) {
      // 左基本壁
      this.drawBaseBlock(ctx, LEFT_WALL_COL * BLOCK_SIZE, gy * BLOCK_SIZE);
      // 右基本壁
      this.drawBaseBlock(ctx, RIGHT_WALL_COL * BLOCK_SIZE, gy * BLOCK_SIZE);
    }

    // 壁にくっついた防壁テトリミノの描画
    for (const block of this.grid.values()) {
      if (!block.isBaseWall && block.pieceRef) {
        const px = block.gx * BLOCK_SIZE;
        const py = block.gy * BLOCK_SIZE;
        block.pieceRef.drawCell(ctx, px, py);
      }
    }

    ctx.restore();
  }

  private drawBaseBlock(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    ctx.fillStyle = '#1c2430';
    ctx.fillRect(px, py, BLOCK_SIZE, BLOCK_SIZE);

    ctx.strokeStyle = '#38475a';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, BLOCK_SIZE - 1, BLOCK_SIZE - 1);

    // テクスチャ（斜線パターン）
    ctx.strokeStyle = '#2b3645';
    ctx.beginPath();
    ctx.moveTo(px, py + BLOCK_SIZE);
    ctx.lineTo(px + BLOCK_SIZE, py);
    ctx.stroke();
  }
}
