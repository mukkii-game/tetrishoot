import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../config';

export type ScrollDirection = 'UP' | 'RIGHT' | 'DIAGONAL_UP_RIGHT';

export class TerrainManager {
  public direction: ScrollDirection = 'UP';
  public enabled = false;
  private scrollOffset = 0;
  private seed = 42;

  constructor() {
    this.reset();
  }

  public reset(direction: ScrollDirection = 'UP', enabled = true): void {
    this.direction = direction;
    this.enabled = enabled;
    this.scrollOffset = 0;
    this.elapsedTime = 0;
    this.seed = Math.random() * 1000;
  }

  public elapsedTime = 0;

  public update(dt: number, speed: number): void {
    if (!this.enabled) return;
    this.scrollOffset += speed * dt;
    this.elapsedTime += dt;
  }

  public getWallThickness(screenCoord: number): { w1: number; w2: number } {
    if (!this.enabled) return { w1: 0, w2: 0 };

    // ステージ開始直後は洞窟の入口として壁が徐々に迫るようにテーパー（開始即死を完全防止）
    const introFactor = Math.min(1.0, this.elapsedTime / 3.0);

    const worldCoord = screenCoord + this.scrollOffset;
    const s = this.seed;

    // ユーザー要望：
    // 「時々、左側しか通れない、右側しか通れない、真ん中しか通れない、左右の地面自体が隆起したりくぼんだりでその時により安全地帯が異なる、という位置取りの遊び」
    // 大きな周期ゾーン（約1200〜1600pxごと、時間にして約8〜12秒ごと）で地形の主導権がダイナミックに変化！
    const zonePeriod = 1400;
    const zonePhase = ((worldCoord + s * 200) % zonePeriod + zonePeriod) % zonePeriod;
    const zoneRatio = zonePhase / zonePeriod; // 0.0 ~ 1.0

    // zoneType:
    // 0.00 ~ 0.20: 【中央突破ゾーン】左右両側から隆起し、中央の細いスリットしか通れない
    // 0.20 ~ 0.35: 【開放・くぼみゾーン】左右とも大きく凹み、広く戦える安全地帯
    // 0.35 ~ 0.55: 【左側スリットゾーン】右側から巨大な岩盤が張り出し、左端の狭い通路しか通れない
    // 0.55 ~ 0.70: 【開放・うねりゾーン】左右が交互に波打つ
    // 0.70 ~ 0.90: 【右側スリットゾーン】左側から巨大な岩盤が張り出し、右端の狭い通路しか通れない
    // 0.90 ~ 1.00: 【開放ゾーン】

    let biasLeft = 0;   // 左壁の追加張り出し (px)
    let biasRight = 0;  // 右壁の追加張り出し (px)

    if (zoneRatio < 0.20) {
      // 中央のみ通路（左・右双方が大きくせり出す）
      const bell = Math.sin((zoneRatio / 0.20) * Math.PI);
      biasLeft = bell * 130;
      biasRight = bell * 130;
    } else if (zoneRatio >= 0.35 && zoneRatio < 0.55) {
      // 左側のみ通路（右壁が画面の65%以上まで大きく張り出す！）
      const bell = Math.sin(((zoneRatio - 0.35) / 0.20) * Math.PI);
      biasRight = bell * 230;
      biasLeft = -bell * 20; // 左側は少し凹んで通りやすく
    } else if (zoneRatio >= 0.70 && zoneRatio < 0.90) {
      // 右側のみ通路（左壁が画面の65%以上まで大きく張り出す！）
      const bell = Math.sin(((zoneRatio - 0.70) / 0.20) * Math.PI);
      biasLeft = bell * 230;
      biasRight = -bell * 20; // 右側は少し凹んで通りやすく
    }

    // 80年代レトロアーケードらしい岩肌の細かい凹凸ノイズ
    const n1 = Math.sin(worldCoord * 0.004 + s);
    const n2 = Math.sin(worldCoord * 0.01 + s * 1.5) * 0.45;
    const n3 = Math.sin(worldCoord * 0.024 + s * 2.3) * 0.25;
    const baseVal1 = Math.max(0, (n1 + n2 + n3 + 0.35) / 1.7);

    const m1 = Math.sin(worldCoord * 0.0042 + s + 3.14);
    const m2 = Math.sin(worldCoord * 0.011 + s * 1.8) * 0.45;
    const m3 = Math.sin(worldCoord * 0.022 + s * 2.7) * 0.25;
    const baseVal2 = Math.max(0, (m1 + m2 + m3 + 0.35) / 1.7);

    if (this.direction === 'UP') {
      const baseReach = 95;
      const totalWidth = CANVAS_WIDTH; // 540
      const minPassage = 155; // 自機が通過可能な最低クリアランス（約5ブロック分）

      let w1 = Math.floor((baseVal1 * baseReach + biasLeft) * introFactor);
      let w2 = Math.floor((baseVal2 * baseReach + biasRight) * introFactor);

      // 安全制限：通路が完全に塞がれて詰まないよう保証
      if (w1 + w2 > totalWidth - minPassage) {
        const excess = (w1 + w2) - (totalWidth - minPassage);
        const half = Math.ceil(excess / 2);
        w1 = Math.max(0, w1 - half);
        w2 = Math.max(0, w2 - half);
      }

      // ユーザー要望：SNKのバンガードのようなブロックによるカクカクした山鳴り地形
      // BLOCK_SIZE (20px) 単位で階段状・山鳴りブロックに量子化
      const blockSize = 20;
      w1 = Math.floor(w1 / blockSize) * blockSize;
      w2 = Math.floor(w2 / blockSize) * blockSize;

      return { w1: Math.max(0, w1), w2: Math.max(0, w2) };
    } else {
      const baseReach = 110;
      const totalHeight = CANVAS_HEIGHT; // 720
      const minPassage = 180;

      let w1 = Math.floor((baseVal1 * baseReach + biasLeft) * introFactor);
      let w2 = Math.floor((baseVal2 * baseReach + biasRight) * introFactor);

      if (w1 + w2 > totalHeight - minPassage) {
        const excess = (w1 + w2) - (totalHeight - minPassage);
        const half = Math.ceil(excess / 2);
        w1 = Math.max(0, w1 - half);
        w2 = Math.max(0, w2 - half);
      }

      const blockSize = 20;
      w1 = Math.floor(w1 / blockSize) * blockSize;
      w2 = Math.floor(w2 / blockSize) * blockSize;

      return { w1: Math.max(0, w1), w2: Math.max(0, w2) };
    }
  }

  public isColliding(x: number, y: number): boolean {
    if (!this.enabled) return false;

    if (this.direction === 'UP') {
      const { w1, w2 } = this.getWallThickness(y);
      if (x < w1) return true;
      if (x > CANVAS_WIDTH - w2) return true;
    } else if (this.direction === 'RIGHT') {
      const { w1, w2 } = this.getWallThickness(x);
      if (y < w1) return true;
      if (y > CANVAS_HEIGHT - w2) return true;
    } else if (this.direction === 'DIAGONAL_UP_RIGHT') {
      // 斜めスクロール：対角線に沿った山鳴り地形判定
      const diagCoord = (x + y) * 0.707;
      const { w1, w2 } = this.getWallThickness(diagCoord);
      // 左下壁（xが小さくyが大きい領域）
      if (x + (CANVAS_HEIGHT - y) < w1 * 1.4) return true;
      // 右上壁（xが大きくyが小さい領域）
      if ((CANVAS_WIDTH - x) + y < w2 * 1.4) return true;
    }
    return false;
  }

  public isRectColliding(x: number, y: number, width: number, height: number): boolean {
    if (!this.enabled) return false;
    const samplePoints = [
      { x, y },
      { x: x + width, y },
      { x, y: y + height },
      { x: x + width, y: y + height },
      { x: x + width / 2, y },
      { x: x + width / 2, y: y + height },
      { x, y: y + height / 2 },
      { x: x + width, y: y + height / 2 },
    ];

    for (const pt of samplePoints) {
      if (this.isColliding(pt.x, pt.y)) return true;
    }
    return false;
  }

  // ★ SNK『バンガード (Vanguard)』風：ブロックによるカクカクした山鳴り地形描画
  public draw(ctx: CanvasRenderingContext2D): void {
    if (!this.enabled) return;

    ctx.save();
    const blockSize = 20; // バンガード風のブロック単位

    if (this.direction === 'UP') {
      // Y方向に20pxブロック単位で階段状に描画
      const startY = -((this.scrollOffset) % blockSize);
      for (let y = startY; y < CANVAS_HEIGHT + blockSize; y += blockSize) {
        const { w1, w2 } = this.getWallThickness(y + blockSize / 2);

        // 左壁：ブロックの列（横にも20px刻みでブロックを並べる）
        if (w1 > 0) {
          for (let bx = 0; bx < w1; bx += blockSize) {
            const bw = Math.min(blockSize, w1 - bx);
            this.drawVanguardBlock(ctx, bx, y, bw, blockSize, '#552200', '#aa4400', '#ff8800');
          }
        }

        // 右壁：ブロックの列
        if (w2 > 0) {
          const rx = CANVAS_WIDTH - w2;
          for (let bx = rx; bx < CANVAS_WIDTH; bx += blockSize) {
            const bw = Math.min(blockSize, CANVAS_WIDTH - bx);
            this.drawVanguardBlock(ctx, bx, y, bw, blockSize, '#552200', '#aa4400', '#ff8800');
          }
        }
      }
    } else if (this.direction === 'RIGHT') {
      // X方向に20pxブロック単位で階段状に描画
      const startX = -((this.scrollOffset) % blockSize);
      for (let x = startX; x < CANVAS_WIDTH + blockSize; x += blockSize) {
        const { w1, w2 } = this.getWallThickness(x + blockSize / 2);

        // 上壁
        if (w1 > 0) {
          for (let by = 0; by < w1; by += blockSize) {
            const bh = Math.min(blockSize, w1 - by);
            this.drawVanguardBlock(ctx, x, by, blockSize, bh, '#002255', '#0055aa', '#00aaff');
          }
        }

        // 下壁
        if (w2 > 0) {
          const by = CANVAS_HEIGHT - w2;
          for (let y = by; y < CANVAS_HEIGHT; y += blockSize) {
            const bh = Math.min(blockSize, CANVAS_HEIGHT - y);
            this.drawVanguardBlock(ctx, x, y, blockSize, bh, '#002255', '#0055aa', '#00aaff');
          }
        }
      }
    } else if (this.direction === 'DIAGONAL_UP_RIGHT') {
      // 斜めスクロール：段々畑状に斜めバンガードブロックを描画
      const start = -((this.scrollOffset) % blockSize);
      for (let y = start; y < CANVAS_HEIGHT + blockSize; y += blockSize) {
        const { w1, w2 } = this.getWallThickness(y + blockSize / 2);
        // 左側段々畑
        if (w1 > 0) {
          for (let bx = 0; bx < w1; bx += blockSize) {
            const bw = Math.min(blockSize, w1 - bx);
            this.drawVanguardBlock(ctx, bx, y, bw, blockSize, '#330044', '#770088', '#cc00ff');
          }
        }
        // 右側段々畑
        if (w2 > 0) {
          const rx = CANVAS_WIDTH - w2;
          for (let bx = rx; bx < CANVAS_WIDTH; bx += blockSize) {
            const bw = Math.min(blockSize, CANVAS_WIDTH - bx);
            this.drawVanguardBlock(ctx, bx, y, bw, blockSize, '#330044', '#770088', '#cc00ff');
          }
        }
      }
    }

    ctx.restore();
  }

  // バンガード風の立体感・輪郭線のあるレトロアーケードブロック描画
  private drawVanguardBlock(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    baseColor: string,
    edgeColor: string,
    highlightColor: string
  ): void {
    // ブロック内部
    ctx.fillStyle = baseColor;
    ctx.fillRect(x, y, w, h);

    // ブロック外枠
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    // 上・左ハイライト（立体感）
    if (w > 2 && h > 2) {
      ctx.fillStyle = highlightColor;
      ctx.fillRect(x + 1, y + 1, w - 2, 2);
      ctx.fillRect(x + 1, y + 1, 2, h - 2);

      // 右・下シャドウ
      ctx.fillStyle = edgeColor;
      ctx.fillRect(x + w - 2, y + 2, 2, h - 3);
      ctx.fillRect(x + 2, y + h - 2, w - 3, 2);
    }
  }
}
