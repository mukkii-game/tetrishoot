import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../config';

export type ScrollDirection = 'UP' | 'RIGHT';

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
      return { w1: Math.max(0, w1), w2: Math.max(0, w2) };
    }
  }

  public isColliding(x: number, y: number): boolean {
    if (!this.enabled) return false;

    if (this.direction === 'UP') {
      const { w1, w2 } = this.getWallThickness(y);
      if (x < w1) return true;
      if (x > CANVAS_WIDTH - w2) return true;
    } else {
      const { w1, w2 } = this.getWallThickness(x);
      if (y < w1) return true;
      if (y > CANVAS_HEIGHT - w2) return true;
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

  public draw(ctx: CanvasRenderingContext2D): void {
    if (!this.enabled) return;

    ctx.save();
    const step = 8;

    if (this.direction === 'UP') {
      for (let y = 0; y < CANVAS_HEIGHT; y += step) {
        const { w1, w2 } = this.getWallThickness(y);

        if (w1 > 0) {
          ctx.fillStyle = '#1e142e';
          ctx.fillRect(0, y, w1, step);
          ctx.fillStyle = '#e86a17';
          ctx.fillRect(w1 - 4, y, 4, step);
          ctx.fillStyle = '#ffaa44';
          ctx.fillRect(w1 - 2, y + 2, 2, step - 4);
        }

        if (w2 > 0) {
          const rx = CANVAS_WIDTH - w2;
          ctx.fillStyle = '#1e142e';
          ctx.fillRect(rx, y, w2, step);
          ctx.fillStyle = '#e86a17';
          ctx.fillRect(rx, y, 4, step);
          ctx.fillStyle = '#ffaa44';
          ctx.fillRect(rx, y + 2, 2, step - 4);
        }
      }
    } else {
      for (let x = 0; x < CANVAS_WIDTH; x += step) {
        const { w1, w2 } = this.getWallThickness(x);

        if (w1 > 0) {
          ctx.fillStyle = '#1a2634';
          ctx.fillRect(x, 0, step, w1);
          ctx.fillStyle = '#29adff';
          ctx.fillRect(x, w1 - 4, step, 4);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x + 2, w1 - 2, step - 4, 2);
        }

        if (w2 > 0) {
          const by = CANVAS_HEIGHT - w2;
          ctx.fillStyle = '#1a2634';
          ctx.fillRect(x, by, step, w2);
          ctx.fillStyle = '#29adff';
          ctx.fillRect(x, by, step, 4);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x + 2, by, step - 4, 2);
        }
      }
    }

    ctx.restore();
  }
}
