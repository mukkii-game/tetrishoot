import { BLOCK_SIZE, BULLET_SPEED, BULLET_WIDTH, CANVAS_HEIGHT, CANVAS_WIDTH } from '../config';

export class PlayerBullet {
  public x: number;
  public y: number;
  public vx: number;
  public vy: number;
  public angle: number;
  public width: number;
  public height: number;
  public color: string;
  public isDead = false;

  constructor(x: number, y: number, angle = -Math.PI / 2, color = '#00ffff') {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.width = BULLET_WIDTH;
    this.height = BLOCK_SIZE * 0.95;
    this.vx = Math.cos(angle) * BULLET_SPEED;
    this.vy = Math.sin(angle) * BULLET_SPEED;
    this.color = color;
  }

  public update(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.y < -50 || this.y > CANVAS_HEIGHT + 50 || this.x < -50 || this.x > CANVAS_WIDTH + 50) {
      this.isDead = true;
    }
  }

  public draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle + Math.PI / 2);

    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 10;

    const left = -this.width / 2;
    const top = -this.height / 2;

    ctx.beginPath();
    ctx.roundRect(left, top, this.width, this.height, 4);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-this.width * 0.25, top + 2, this.width * 0.5, this.height - 4);

    ctx.restore();
  }
}
