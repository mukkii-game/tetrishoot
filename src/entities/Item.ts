import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../config';

export type ItemType = 'BARRIER_ORB' | 'RESCUE_CAPSULE';

export class FieldItem {
  public x: number;
  public y: number;
  public type: ItemType;
  public radius = 16;
  public isDead = false;
  public animTimer = 0;

  constructor(x: number, y: number, type: ItemType) {
    this.x = x;
    this.y = y;
    this.type = type;
  }

  public update(dt: number, scrollSpeed: number, scrollDir: 'UP' | 'RIGHT' | 'DIAGONAL_UP_RIGHT'): void {
    this.animTimer += dt;

    if (scrollDir === 'UP') {
      this.y += scrollSpeed * dt;
    } else if (scrollDir === 'RIGHT') {
      this.x -= scrollSpeed * dt;
    } else if (scrollDir === 'DIAGONAL_UP_RIGHT') {
      this.x -= scrollSpeed * 0.7 * dt;
      this.y += scrollSpeed * 0.7 * dt;
    }

    if (this.y > CANVAS_HEIGHT + 40 || this.x < -40 || this.x > CANVAS_WIDTH + 40 || this.y < -40) {
      this.isDead = true;
    }
  }

  public draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(this.x, this.y);

    const pulse = 1.0 + Math.sin(this.animTimer * 6) * 0.15;
    ctx.scale(pulse, pulse);

    if (this.type === 'BARRIER_ORB') {
      // 鮮やかなレインボーシールドオーブ
      const hue = Math.floor((this.animTimer * 180) % 360);
      ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;
      ctx.shadowBlur = 14;

      ctx.fillStyle = `hsl(${hue}, 100%, 65%)`;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();

      // 内側コア
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 0.45, 0, Math.PI * 2);
      ctx.fill();

      // 回転リング
      ctx.rotate(this.animTimer * 4);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(-this.radius * 0.7, -this.radius * 0.7, this.radius * 1.4, this.radius * 1.4);
    } else if (this.type === 'RESCUE_CAPSULE') {
      // テトリミノ召喚カプセル（シアン＋イエローネオン）
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 12;

      ctx.fillStyle = '#00ffff';
      ctx.beginPath();
      ctx.roundRect(-14, -14, 28, 28, 6);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-6, -6, 12, 12);

      // テトリス「T」マーク
      ctx.fillStyle = '#cc00ff';
      ctx.fillRect(-8, -10, 16, 4);
      ctx.fillRect(-2, -6, 4, 12);
    }

    ctx.restore();
  }
}
