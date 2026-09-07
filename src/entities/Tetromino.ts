import { BLOCK_SIZE, PIECE_MAX_HP, TETROMINO_COLORS } from '../config';

export type TetrominoType = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';

export interface GridCoord {
  gx: number; // 相対グリッドX
  gy: number; // 相対グリッドY
}

// 7つのテトリミノの形状定義（4セル）
export const TETROMINO_SHAPES: Record<TetrominoType, GridCoord[]> = {
  I: [
    { gx: 0, gy: 0 }, { gx: 1, gy: 0 }, { gx: 2, gy: 0 }, { gx: 3, gy: 0 }
  ],
  J: [
    { gx: 0, gy: 0 }, { gx: 0, gy: 1 }, { gx: 1, gy: 1 }, { gx: 2, gy: 1 }
  ],
  L: [
    { gx: 2, gy: 0 }, { gx: 0, gy: 1 }, { gx: 1, gy: 1 }, { gx: 2, gy: 1 }
  ],
  O: [
    { gx: 0, gy: 0 }, { gx: 1, gy: 0 }, { gx: 0, gy: 1 }, { gx: 1, gy: 1 }
  ],
  S: [
    { gx: 1, gy: 0 }, { gx: 2, gy: 0 }, { gx: 0, gy: 1 }, { gx: 1, gy: 1 }
  ],
  T: [
    { gx: 1, gy: 0 }, { gx: 0, gy: 1 }, { gx: 1, gy: 1 }, { gx: 2, gy: 1 }
  ],
  Z: [
    { gx: 0, gy: 0 }, { gx: 1, gy: 0 }, { gx: 1, gy: 1 }, { gx: 2, gy: 1 }
  ],
};

// 銃口：各ミノの端点セルから外側に向かう方向
export interface GunPort {
  cellGx: number; // 発射元セルのミノ相対gx
  cellGy: number; // 発射元セルのミノ相対gy
  dirX: number;   // 発射方向 (-1: 左, 1: 右, 0: なし)
  dirY: number;   // 発射方向 (-1: 上, 1: 下, 0: なし)
  angle: number;  // 弾の進行方向ラジアン (真上: -PI/2)
}

export class TetrominoPiece {
  public id: string;
  public type: TetrominoType;
  public color: string;
  public cells: GridCoord[];
  public hp: number;
  public maxHp: number;
  public damageFlashTime = 0;
  public gunPorts: GunPort[] = [];

  constructor(type: TetrominoType, customHp = PIECE_MAX_HP) {
    this.id = Math.random().toString(36).substring(2, 9);
    this.type = type;
    this.color = TETROMINO_COLORS[type];
    this.cells = TETROMINO_SHAPES[type].map(c => ({ ...c }));
    this.maxHp = customHp;
    this.hp = customHp;
    this.calculateGunPorts();
  }

  /**
   * ミノの端点（入口・出口）を幾何学的に特定し、銃口を算出
   * - 各セルについて、上下左右に隣り合うセルの数を計算
   * - 隣接セルが1個だけのセル＝端点（入口／出口）
   *   → 接続元セルと反対の外側方向へ弾が発射される
   * - I型: 端点2個（両端から反対方向へ）
   * - T型: 端点3個（3方向へ）
   * - L, J, S, Z型: 端点2個（2方向へ）
   * - O型: 全セル隣接数2（端点0個＝弾が出ない）
   */
  public calculateGunPorts(): void {
    this.gunPorts = [];
    if (this.type === 'O') {
      // Oミノは弾が出ない
      return;
    }

    const cellSet = new Set(this.cells.map(c => `${c.gx},${c.gy}`));
    const directions = [
      { dx: 0, dy: -1 }, // 上
      { dx: 1, dy: 0 },  // 右
      { dx: 0, dy: 1 },  // 下
      { dx: -1, dy: 0 }, // 左
    ];

    for (const cell of this.cells) {
      const neighbors: { dx: number; dy: number }[] = [];
      for (const d of directions) {
        if (cellSet.has(`${cell.gx + d.dx},${cell.gy + d.dy}`)) {
          neighbors.push(d);
        }
      }

      // 端点セル判定（隣接セルが1つだけ）
      if (neighbors.length === 1) {
        const connectedDir = neighbors[0];
        // 外向き方向 = 接続元と真逆
        const fireDirX = -connectedDir.dx;
        const fireDirY = -connectedDir.dy;
        const angle = Math.atan2(fireDirY, fireDirX);

        this.gunPorts.push({
          cellGx: cell.gx,
          cellGy: cell.gy,
          dirX: fireDirX,
          dirY: fireDirY,
          angle,
        });
      }
    }
  }

  // 90度時計回りに回転
  public rotate(): void {
    if (this.type === 'O') return;

    // (x, y) -> (-y, x)
    this.cells = this.cells.map(c => ({
      gx: -c.gy,
      gy: c.gx,
    }));

    // 最小gx, gyが0になるよう正規化
    const minX = Math.min(...this.cells.map(c => c.gx));
    const minY = Math.min(...this.cells.map(c => c.gy));
    this.cells.forEach(c => {
      c.gx -= minX;
      c.gy -= minY;
    });

    this.calculateGunPorts();
  }

  // 反時計回り回転（元に戻す時用）
  public rotateCounter(): void {
    if (this.type === 'O') return;
    this.rotate();
    this.rotate();
    this.rotate();
  }

  public hit(damage = 1): boolean {
    this.hp -= damage;
    this.damageFlashTime = 0.15;
    return this.hp <= 0;
  }

  public update(dt: number): void {
    if (this.damageFlashTime > 0) {
      this.damageFlashTime -= dt;
    }
  }

  // 単体セル描画
  public drawCell(
    ctx: CanvasRenderingContext2D,
    pixelX: number,
    pixelY: number,
    overrideColor?: string,
    alpha = 1.0,
    hasGunPort = false,
    gunAngle?: number
  ): void {
    ctx.save();
    ctx.globalAlpha = alpha;

    const fill = this.damageFlashTime > 0 ? '#ffffff' : (overrideColor || this.color);
    ctx.fillStyle = fill;
    ctx.fillRect(pixelX, pixelY, BLOCK_SIZE, BLOCK_SIZE);

    // テトリスブロック風のハイライト
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pixelX + 1, pixelY + BLOCK_SIZE - 1);
    ctx.lineTo(pixelX + 1, pixelY + 1);
    ctx.lineTo(pixelX + BLOCK_SIZE - 1, pixelY + 1);
    ctx.stroke();

    // 影
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.moveTo(pixelX + BLOCK_SIZE - 1, pixelY + 1);
    ctx.lineTo(pixelX + BLOCK_SIZE - 1, pixelY + BLOCK_SIZE - 1);
    ctx.lineTo(pixelX + 1, pixelY + BLOCK_SIZE - 1);
    ctx.stroke();

    // 銃口インジケータ（発射口があるセルの外周にネオンマズルを描画）
    if (hasGunPort && gunAngle !== undefined) {
      ctx.save();
      const cx = pixelX + BLOCK_SIZE / 2;
      const cy = pixelY + BLOCK_SIZE / 2;
      ctx.translate(cx, cy);
      ctx.rotate(gunAngle);

      ctx.fillStyle = '#ffea00';
      ctx.shadowColor = '#ffea00';
      ctx.shadowBlur = 6;
      // セルの外側エッジにマズルを配置
      ctx.fillRect(BLOCK_SIZE / 2 - 3, -4, 4, 8);
      ctx.restore();
    }

    ctx.restore();
  }
}
