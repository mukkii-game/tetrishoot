import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../config';

interface Star {
  x: number;
  y: number;
  speed: number;
  color: string;
  size: number;
  twinkleOffset: number;
  twinkleGroup: number; // ★ 性能対策：またたきを8グループに集約して描画状態の切替回数を減らす
}

interface GalaxyArmPoint {
  dist: number;
  angleOffset: number;
  color: string;
  size: number;
}

export class Starfield {
  private stars: Star[] = [];
  public direction: 'UP' | 'RIGHT' | 'LEFT' | 'DIAGONAL_UP_RIGHT' = 'UP';
  // 渦巻き銀河
  private galaxyY = -200;
  private galaxyX = CANVAS_WIDTH * 0.55;
  private galaxyRotation = 0;
  private galaxyPoints: GalaxyArmPoint[] = [];

  constructor(count = 100) {
    const colors = ['#ffffff', '#ffff88', '#88ccff', '#ff8888', '#00ffff'];
    const TWINKLE_GROUPS = 8;
    for (let i = 0; i < count; i++) {
      const group = Math.floor(Math.random() * TWINKLE_GROUPS);
      this.stars.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        speed: Math.random() * 90 + 25,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() > 0.85 ? 2.5 : 1.5,
        // グループごとに位相を共有すると、同じ不透明度の星が連続して並ぶので
        // globalAlpha の切替がまとめられる（見た目のランダム感はほぼ変わらない）
        twinkleOffset: (group / TWINKLE_GROUPS) * Math.PI * 2,
        twinkleGroup: group,
      });
    }
    // ★ 性能対策：色→グループ順に並べておくと、描画ループで
    //   fillStyle / globalAlpha の設定が「星ごと」から「連続した塊ごと」に減る。
    //   星は個々の識別が不要なので並べ替えても見た目は変わらない。
    this.stars.sort((a, b) =>
      a.color === b.color ? a.twinkleGroup - b.twinkleGroup : (a.color < b.color ? -1 : 1)
    );

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
    } else if (this.direction === 'RIGHT') {
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
    } else if (this.direction === 'LEFT') {
      // 左スクロール（自機が左に進む）：星は右方向へ流れる
      for (const star of this.stars) {
        star.x += star.speed * speedMultiplier * dt;
        if (star.x > CANVAS_WIDTH) {
          star.x = 0;
          star.y = Math.random() * CANVAS_HEIGHT;
        }
      }

      this.galaxyX += 15 * speedMultiplier * dt;
      this.galaxyRotation -= 0.08 * dt;
      if (this.galaxyX > CANVAS_WIDTH + 250) {
        this.galaxyX = -250;
        this.galaxyY = Math.random() * (CANVAS_HEIGHT - 200) + 100;
      }
    } else if (this.direction === 'DIAGONAL_UP_RIGHT') {
      // 斜め右上スクロール（バンガード）：自機が右上へ進む＝星・宇宙雲は左下（-X, +Y）へダイナミックに高速移動
      for (const star of this.stars) {
        const diagSpeed = star.speed * 1.3 * speedMultiplier * dt;
        star.x -= diagSpeed;
        star.y += diagSpeed;
        // 画面左端または下端を抜けたら、右上領域（X: 0〜CANVAS_WIDTH+200, Y: -10〜0）へ再配置
        if (star.x < -10 || star.y > CANVAS_HEIGHT + 10) {
          if (Math.random() > 0.5) {
            star.x = CANVAS_WIDTH + 10;
            star.y = Math.random() * (CANVAS_HEIGHT * 0.7);
          } else {
            star.x = Math.random() * CANVAS_WIDTH + 50;
            star.y = -10;
          }
        }
      }

      this.galaxyX -= 25 * speedMultiplier * dt;
      this.galaxyY += 25 * speedMultiplier * dt;
      this.galaxyRotation += 0.08 * dt;
      if (this.galaxyY > CANVAS_HEIGHT + 250 || this.galaxyX < -250) {
        this.galaxyY = -250;
        this.galaxyX = CANVAS_WIDTH + 100;
      }
    }
  }

  // ★ 性能対策：渦巻き銀河（ネビュラ＋コア＋腕の星182個）は中身が変化しないので、
  //   一度だけオフスクリーンに描いておき、毎フレームは回転付きで1回 drawImage するだけにする。
  //   （以前は毎フレーム グラデーション2個の生成 + fillRect 182回 を行っていた）
  private galaxySprite: HTMLCanvasElement | null = null;
  private static readonly GALAXY_R = 190; // スプライト半径（腕は最大160＋余白）

  private buildGalaxySprite(): HTMLCanvasElement | null {
    const r = Starfield.GALAXY_R;
    const size = r * 2;
    let c: HTMLCanvasElement;
    try {
      c = document.createElement('canvas');
    } catch {
      return null;
    }
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    if (!g) return null;
    g.translate(r, r);

    // 深宇宙のネビュラ
    const nebula = g.createRadialGradient(0, 0, 10, 0, 0, 180);
    nebula.addColorStop(0, 'rgba(160, 40, 220, 0.22)');
    nebula.addColorStop(0.4, 'rgba(0, 180, 255, 0.12)');
    nebula.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = nebula;
    g.fillRect(-180, -180, 360, 360);

    // 銀河の中心コア発光
    const core = g.createRadialGradient(0, 0, 0, 0, 0, 40);
    core.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    core.addColorStop(0.3, 'rgba(255, 200, 255, 0.4)');
    core.addColorStop(1, 'rgba(255, 100, 200, 0)');
    g.fillStyle = core;
    g.beginPath();
    g.arc(0, 0, 40, 0, Math.PI * 2);
    g.fill();

    // 銀河の腕の星々（同じ色が続くよう並べ替えて fillStyle の切替を減らす）
    const pts = this.galaxyPoints.slice().sort((a, b) => (a.color < b.color ? -1 : a.color > b.color ? 1 : 0));
    let lastColor = '';
    for (const p of pts) {
      if (p.color !== lastColor) {
        g.fillStyle = p.color;
        lastColor = p.color;
      }
      g.fillRect(Math.cos(p.angleOffset) * p.dist, Math.sin(p.angleOffset) * p.dist * 0.7, p.size, p.size);
    }
    return c;
  }

  public draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    // 1〜2. ネビュラ＋渦巻き銀河（事前描画したスプライトを回転して1回だけ転送）
    //   ★ 性能対策：銀河は画面外へ流れていく時間帯が長いので、
    //     完全に画面外なら転送自体を省く。実測でここが描画コストのほぼ全て
    //     （CPU 1/6速・DPR3 の stage10 HARD で約1.07ms/frame）だったため効果が大きい。
    const r = Starfield.GALAXY_R;
    const onScreen =
      this.galaxyX + r > 0 && this.galaxyX - r < CANVAS_WIDTH &&
      this.galaxyY + r > 0 && this.galaxyY - r < CANVAS_HEIGHT;
    if (onScreen) {
      if (!this.galaxySprite) this.galaxySprite = this.buildGalaxySprite();
      if (this.galaxySprite) {
        ctx.save();
        ctx.translate(this.galaxyX, this.galaxyY);
        ctx.rotate(this.galaxyRotation);
        ctx.drawImage(this.galaxySprite, -r, -r);
        ctx.restore();
      }
    }

    // 3. 多層スターフィールド（きらめく星々）
    //    色・またたきグループ順に並べてあるので、状態変更は塊ごとに1回で済む
    const time = performance.now() / 300;
    let lastColor = '';
    let lastAlpha = -1;
    for (const star of this.stars) {
      const raw = 0.5 + Math.sin(time + star.twinkleOffset) * 0.5;
      const alpha = Math.round(Math.max(0.2, raw) * 8) / 8;
      if (alpha !== lastAlpha) {
        ctx.globalAlpha = alpha;
        lastAlpha = alpha;
      }
      if (star.color !== lastColor) {
        ctx.fillStyle = star.color;
        lastColor = star.color;
      }
      ctx.fillRect(Math.floor(star.x), Math.floor(star.y), star.size, star.size);
    }

    ctx.restore();
  }
}
