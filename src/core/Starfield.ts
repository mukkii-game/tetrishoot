import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../config';

interface Star {
  x: number;
  y: number;
  speed: number;
  color: string;
  size: number;
}

export class Starfield {
  private stars: Star[] = [];

  constructor(count = 70) {
    const colors = ['#ffffff', '#ffff77', '#77aaff', '#ff7777'];
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        speed: Math.random() * 80 + 30, // 多重スクロール速度
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() > 0.8 ? 2 : 1,
      });
    }
  }

  public update(dt: number, speedMultiplier = 1.0): void {
    for (const star of this.stars) {
      star.y += star.speed * speedMultiplier * dt;
      if (star.y > CANVAS_HEIGHT) {
        star.y = 0;
        star.x = Math.random() * CANVAS_WIDTH;
      }
    }
  }

  public draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const star of this.stars) {
      ctx.fillStyle = star.color;
      ctx.fillRect(Math.floor(star.x), Math.floor(star.y), star.size, star.size);
    }
    ctx.restore();
  }
}
