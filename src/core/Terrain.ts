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

    const n1 = Math.sin(worldCoord * 0.0035 + s);
    const n2 = Math.sin(worldCoord * 0.008 + s * 1.5) * 0.5;
    const n3 = Math.sin(worldCoord * 0.02 + s * 2.3) * 0.25;
    const rawVal1 = Math.max(0, (n1 + n2 + n3 + 0.3) / 1.8);

    const m1 = Math.sin(worldCoord * 0.0038 + s + 3.14);
    const m2 = Math.sin(worldCoord * 0.009 + s * 1.8) * 0.5;
    const m3 = Math.sin(worldCoord * 0.018 + s * 2.7) * 0.25;
    const rawVal2 = Math.max(0, (m1 + m2 + m3 + 0.3) / 1.8);

    if (this.direction === 'UP') {
      const maxReach = 120;
      const w1 = Math.floor(rawVal1 * maxReach * introFactor);
      const w2 = Math.floor(rawVal2 * maxReach * introFactor);
      return { w1, w2 };
    } else {
      const maxReach = 160;
      const w1 = Math.floor(rawVal1 * maxReach * introFactor);
      const w2 = Math.floor(rawVal2 * maxReach * introFactor);
      return { w1, w2 };
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
