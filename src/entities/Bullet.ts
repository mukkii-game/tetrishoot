import { BLOCK_SIZE, BULLET_SPEED, BULLET_WIDTH, CANVAS_HEIGHT, CANVAS_WIDTH, ENEMY_BULLET_RADIUS, ENEMY_BULLET_SPEED } from '../config';

export class PlayerBullet {
  public x: number; // 中心X
  public y: number; // 先端Y
  public vx: number;
  public vy: number;
  public width: number;
  public height: number;
  public color: string;
  public isDead = false;

  constructor(x: number, y: number, angle = -Math.PI / 2, color = '#00ffff') {
    this.x = x;
    this.y = y;
    this.width = BULLET_WIDTH;
    this.height = BLOCK_SIZE * 0.9;
    this.vx = Math.cos(angle) * BULLET_SPEED;
    this.vy = Math.sin(angle) * BULLET_SPEED;
    this.color = color;
  }

  public update(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.y < -50 || this.x < -50 || this.x > CANVAS_WIDTH + 50) {
      this.isDead = true;
    }
  }

  public draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 10;

    // ビーム弾（丸みを帯びた長方形カプセル）
    const left = this.x - this.width / 2;
    const top = this.y - this.height;

    ctx.beginPath();
    ctx.roundRect(left, top, this.width, this.height, 4);
    ctx.fill();

    // コアの白いハイライト
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(this.x - this.width * 0.25, top + 2, this.width * 0.5, this.height - 4);

    ctx.restore();
  }
}

export class EnemyBullet {
  public x: number;
  public y: number;
  public vx: number;
  public vy: number;
  public radius = ENEMY_BULLET_RADIUS;
  public color = '#ff3366';
  public isDead = false;

  constructor(x: number, y: number, targetX?: number, targetY?: number) {
    this.x = x;
    this.y = y;
    if (targetX !== undefined && targetY !== undefined) {
      const dx = targetX - x;
      const dy = targetY - y;
      const dist = Math.hypot(dx, dy) || 1;
      this.vx = (dx / dist) * ENEMY_BULLET_SPEED;
      this.vy = (dy / dist) * ENEMY_BULLET_SPEED;
    } else {
      this.vx = 0;
      this.vy = ENEMY_BULLET_SPEED;
    }
  }

  public update(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // 画面外判定
    if (this.y > CANVAS_HEIGHT + 30 || this.y < -30 || this.x < -30 || this.x > CANVAS_WIDTH + 30) {
      this.isDead = true;
    }
  }

  public draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.shadowColor = '#ff0033';
    ctx.shadowBlur = 8;

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // 中心の光彩
    ctx.fillStyle = '#ffcccc';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
