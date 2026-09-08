import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../config';

interface Star {
  x: number;
  y: number;
  speed: number;
  color: string;
  size: number;
  twinkleOffset: number;
}

interface GalaxyArmPoint {
  dist: number;
  angleOffset: number;
  color: string;
  size: number;
}

export class Starfield {
  private stars: Star[] = [];
  public direction: 'UP' | 'RIGHT' = 'UP';
  // 渦巻き銀河
  private galaxyY = -200;
  private galaxyX = CANVAS_WIDTH * 0.55;
  private galaxyRotation = 0;
  private galaxyPoints: GalaxyArmPoint[] = [];

  constructor(count = 100) {
    const colors = ['#ffffff', '#ffff88', '#88ccff', '#ff8888', '#00ffff'];
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        speed: Math.random() * 90 + 25,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() > 0.85 ? 2.5 : 1.5,
        twinkleOffset: Math.random() * Math.PI * 2,
      });
    }

    // 渦巻き銀河の星々を生成（2本の渦巻き腕）
    const armColors = ['#cc44ff', '#00f0ff', '#ff00aa', '#ffffff', '#8888ff'];
    for (let i = 0; i < 180; i++) {
      const dist = Math.pow(Math.random(), 0.7) * 160;
      // 2本腕のスパイラル
      const arm = Math.random() > 0.5 ? 0 : Math.PI;
      const spiralAngle = arm + (dist / 160) * Math.PI * 2.8 + (Math.random() - 0.5) * 0.6;
      this.galaxyPoints.push({
        dist,
        angleOffset: spiralAngle,
        color: armColors[Math.floor(Math.random() * armColors.length)],
        size: Math.random() * 2.2 + 0.8,
      });
    }
  }

  public update(dt: number, speedMultiplier = 1.0): void {
    if (this.direction === 'UP') {
      // 縦スクロール：下方向へ流れる
      for (const star of this.stars) {
        star.y += star.speed * speedMultiplier * dt;
        if (star.y > CANVAS_HEIGHT) {
          star.y = 0;
          star.x = Math.random() * CANVAS_WIDTH;
        }
      }

      // 銀河の移動＆自転
      this.galaxyY += 15 * speedMultiplier * dt;
      this.galaxyRotation += 0.08 * dt;
      if (this.galaxyY > CANVAS_HEIGHT + 250) {
        this.galaxyY = -250;
        this.galaxyX = Math.random() * (CANVAS_WIDTH - 200) + 100;
      }
    } else {
      // 右スクロール（自機が右に進む）：星は左方向へ流れる
      for (const star of this.stars) {
        star.x -= star.speed * speedMultiplier * dt;
        if (star.x < 0) {
          star.x = CANVAS_WIDTH;
          star.y = Math.random() * CANVAS_HEIGHT;
        }
      }

      this.galaxyX -= 15 * speedMultiplier * dt;
      this.galaxyRotation += 0.08 * dt;
      if (this.galaxyX < -250) {
        this.galaxyX = CANVAS_WIDTH + 250;
        this.galaxyY = Math.random() * (CANVAS_HEIGHT - 200) + 100;
      }
    }
  }

  public draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    // 1. 深宇宙のネビュラ（星雲）の淡い光彩
    const nebulaGrad = ctx.createRadialGradient(
      this.galaxyX, this.galaxyY, 10,
      this.galaxyX, this.galaxyY, 180
    );
    nebulaGrad.addColorStop(0, 'rgba(160, 40, 220, 0.22)');
    nebulaGrad.addColorStop(0.4, 'rgba(0, 180, 255, 0.12)');
    nebulaGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = nebulaGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 2. 渦巻き銀河（Spiral Galaxy）の描画
    ctx.save();
    ctx.translate(this.galaxyX, this.galaxyY);
    ctx.rotate(this.galaxyRotation);

    // 銀河の中心コア発光
    const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 40);
    coreGrad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    coreGrad.addColorStop(0.3, 'rgba(255, 200, 255, 0.4)');
    coreGrad.addColorStop(1, 'rgba(255, 100, 200, 0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI * 2);
    ctx.fill();

    // 銀河の腕の星々
    for (const p of this.galaxyPoints) {
      const px = Math.cos(p.angleOffset) * p.dist;
      const py = Math.sin(p.angleOffset) * p.dist * 0.7; // 楕円傾斜
      ctx.fillStyle = p.color;
      ctx.fillRect(px, py, p.size, p.size);
    }
    ctx.restore();

    // 3. 多層スターフィールド（きらめく星々）
    const time = Date.now() / 300;
    for (const star of this.stars) {
      const alpha = 0.5 + Math.sin(time + star.twinkleOffset) * 0.5;
      ctx.globalAlpha = Math.max(0.2, alpha);
      ctx.fillStyle = star.color;
      ctx.fillRect(Math.floor(star.x), Math.floor(star.y), star.size, star.size);
    }

    ctx.restore();
  }
}
