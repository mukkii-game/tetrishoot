import { BLOCK_SIZE, PIECE_MAX_HP, TETROMINO_COLORS } from '../config';

export type TetrominoType = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';

export interface GridCoord {
  gx: number; // グリッドX (相対または絶対)
  gy: number; // グリッドY
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

export interface GunPort {
  relX: number; // ミノ中心またはセル相対のピクセルオフセットX
  relY: number; // オフセットY
  angleOffset: number; // 発射角度（ラジアン: 0は真上 -PI/2）
}

// 落下中またはドッキングされたテトリミノ
export class TetrominoPiece {
  public id: string;
  public type: TetrominoType;
  public color: string;
  public cells: GridCoord[]; // 相対セル座標
  public hp: number;
  public maxHp: number;
  public damageFlashTime = 0; // 被弾時の点滅タイマー
  public gunPorts: GunPort[] = [];

  constructor(type: TetrominoType, customHp = PIECE_MAX_HP) {
    this.id = Math.random().toString(36).substring(2, 9);
    this.type = type;
    this.color = TETROMINO_COLORS[type];
    // 形状のコピー
    this.cells = TETROMINO_SHAPES[type].map(c => ({ ...c }));
    this.maxHp = customHp;
    this.hp = customHp;
    this.setupGunPorts();
  }

  // 銃口の配置（仕様：Oは0発、Tは3箇所、他は2箇所）
  private setupGunPorts(): void {
    if (this.type === 'O') {
      // Oミノは弾が出ない
      this.gunPorts = [];
      return;
    }

    // 上端にあるセルの位置を調べる
    const minYPerX: { [x: number]: number } = {};
    for (const cell of this.cells) {
      if (minYPerX[cell.gx] === undefined || cell.gy < minYPerX[cell.gx]) {
        minYPerX[cell.gx] = cell.gy;
      }
    }

    const availableX = Object.keys(minYPerX).map(Number).sort((a, b) => a - b);

    if (this.type === 'T') {
      // Tミノに限り3箇所から弾が出る（3WAYまたは前方ワイド）
      // 中央、左、右
      this.gunPorts = [
        // 中央上（直進）
        {
          relX: (1 + 0.5) * BLOCK_SIZE,
          relY: 0,
          angleOffset: 0,
        },
        // 左（やや左斜め）
        {
          relX: (0 + 0.5) * BLOCK_SIZE,
          relY: 1 * BLOCK_SIZE,
          angleOffset: -0.12,
        },
        // 右（やや右斜め）
        {
          relX: (2 + 0.5) * BLOCK_SIZE,
          relY: 1 * BLOCK_SIZE,
          angleOffset: 0.12,
        },
      ];
    } else {
      // その他（I, J, L, S, Z）は2箇所から出る
      if (availableX.length >= 2) {
        const leftX = availableX[0];
        const rightX = availableX[availableX.length - 1];
        this.gunPorts = [
          {
            relX: (leftX + 0.5) * BLOCK_SIZE,
            relY: minYPerX[leftX] * BLOCK_SIZE,
            angleOffset: 0,
          },
          {
            relX: (rightX + 0.5) * BLOCK_SIZE,
            relY: minYPerX[rightX] * BLOCK_SIZE,
            angleOffset: 0,
          },
        ];
      } else {
        // セル幅が狭い場合
        this.gunPorts = [
          { relX: BLOCK_SIZE * 0.3, relY: 0, angleOffset: 0 },
          { relX: BLOCK_SIZE * 0.7, relY: 0, angleOffset: 0 },
        ];
      }
    }
  }

  // 90度時計回りに回転
  public rotate(): void {
    if (this.type === 'O') return;
    this.cells = this.cells.map(c => ({
      gx: 3 - c.gy,
      gy: c.gx,
    }));
    // 最小gx, gyを0に正規化
    const minX = Math.min(...this.cells.map(c => c.gx));
    const minY = Math.min(...this.cells.map(c => c.gy));
    this.cells.forEach(c => {
      c.gx -= minX;
      c.gy -= minY;
    });
    this.setupGunPorts();
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
    alpha = 1.0
  ): void {
    ctx.save();
    ctx.globalAlpha = alpha;

    const fill = this.damageFlashTime > 0 ? '#ffffff' : (overrideColor || this.color);
    ctx.fillStyle = fill;
    ctx.fillRect(pixelX, pixelY, BLOCK_SIZE, BLOCK_SIZE);

    // テトリスブロック風の光沢ハイライト
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

    // 銃口インジケータ（Oミノ以外でシューティング時などに小さく表示）
    if (this.type !== 'O' && this.gunPorts.length > 0) {
      ctx.fillStyle = '#ffea00';
      ctx.fillRect(pixelX + BLOCK_SIZE / 2 - 2, pixelY, 4, 3);
    }

    ctx.restore();
  }
}
