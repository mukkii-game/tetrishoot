import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../config';

// 視覚エフェクト・パーティクルシステム
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  decay: number;
  gravity?: number;
}

// 80年代アーケード風パラパラ爆発（ギャラガ／ムーンクレスタ風 3パターン拡大爆発）
export interface RetroExplosion {
  x: number;
  y: number;
  scale: number;
  timer: number;
  frame: number;
  maxFrames: number;
  frameDuration: number;
  isFinished: boolean;
}

export class ParticleManager {
  private particles: Particle[] = [];
  private retroExplosions: RetroExplosion[] = [];

  // ★ 性能対策：粒子数の上限。
  //   9面HARDの実測では上限が無いと 11,000 個まで膨れ上がり、
  //   update だけで 1フレーム 150ms を食って（スマホ想定のCPU 1/4 速度で）
  //   完全に処理落ちしていた。見た目はこの程度で十分に派手なので上限を設ける。
  private static readonly MAX_PARTICLES = 1100;

  /** 上限を超えないよう、今から出せる個数を返す */
  private roomFor(count: number): number {
    const room = ParticleManager.MAX_PARTICLES - this.particles.length;
    return room <= 0 ? 0 : (count < room ? count : room);
  }

  // 80年代名作STG（ギャラガ／ムーンクレスタ）の自機爆発パラパラアニメーションを発火
  public emitRetroExplosion(x: number, y: number, scale = 2.4, frameDuration = 0.14): void {
    this.retroExplosions.push({
      x,
      y,
      scale,
      timer: 0,
      frame: 0,
      maxFrames: 4, // 0: 初期破裂, 1: 炎輪拡大, 2: 最大散乱, 3: 消滅余波
      frameDuration, // レトロなパラパラ感のあるコマ送り速度
      isFinished: false,
    });
  }

  // ★ ユーザー要望：ボスのド迫力ヤラレ爆発！巨大パラパラ爆発が時間差で連続発生！
  public emitBossExplosion(x: number, y: number, width: number, height: number): void {
    // 1. 中心部での超巨大レトロ爆発
    this.emitRetroExplosion(x, y, 4.5, 0.16);

    // 2. 機体の四隅・各部位に時間差で広がる多重誘爆
    const offsets = [
      { dx: -width * 0.35, dy: -height * 0.25, delay: 0.08, scale: 3.2 },
      { dx: width * 0.35, dy: -height * 0.25, delay: 0.15, scale: 3.4 },
      { dx: -width * 0.25, dy: height * 0.25, delay: 0.22, scale: 3.0 },
      { dx: width * 0.25, dy: height * 0.25, delay: 0.28, scale: 3.6 },
      { dx: 0, dy: 0, delay: 0.35, scale: 5.2 }, // 最後のトドメの超特大爆散！
    ];

    offsets.forEach(off => {
      window.setTimeout(() => {
        this.emitRetroExplosion(x + off.dx, y + off.dy, off.scale, 0.13);
        this.emitExplosion(x + off.dx, y + off.dy, '#ffea00', 30, true);
        this.emitExplosion(x + off.dx, y + off.dy, '#ff2200', 25, true);
      }, off.delay * 1000);
    });

    // 3. 高速散乱する無数のピクセル破片
    this.emitExplosion(x, y, '#ffffff', 50, true);
    this.emitExplosion(x, y, '#ff0055', 40, true);
    this.emitExplosion(x, y, '#00ffff', 40, true);
  }

  // 80年代スーパーカセットビジョン／往年アーケード風：鮮やかな原色カラーパレット
  // 赤、黄、シアン、白、マゼンタ、緑、オレンジ
  private static readonly RETRO_PRIMARY_COLORS = [
    '#ff0033', // 原色レッド
    '#ffea00', // 原色イエロー
    '#00f0ff', // 原色シアン
    '#ffffff', // ピュアホワイト
    '#ff0077', // 鮮烈マゼンタ
    '#00ff44', // ネオングリーン
    '#ff6600', // ビビッドオレンジ
  ];

  public emitExplosion(x: number, y: number, color: string, count = 20, big = false): void {
    count = this.roomFor(count);
    if (count === 0) return;
    const speedBase = big ? 280 : 180;
    // ザコの死にパーティクルもドットを大きめ（bigなら8〜14px、通常敵でも5〜9px）にして
    // スーパーカセットビジョンのような粗い原色四角ドットの飛び散りを強調！
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (Math.random() * 0.75 + 0.25) * speedBase;
      
      // 原色カラーのブレンド（指定色ベースに加え、原色パレットをミックスしてレトロ感アップ）
      const pColor = Math.random() < 0.4 
        ? color 
        : ParticleManager.RETRO_PRIMARY_COLORS[Math.floor(Math.random() * ParticleManager.RETRO_PRIMARY_COLORS.length)];

      const size = big 
        ? Math.floor(Math.random() * 6) * 2 + 8   // 8, 10, 12, 14, 16, 18px
        : Math.floor(Math.random() * 4) * 2 + 6;  // 6, 8, 10, 12px (クッキリした偶数ピクセル)

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: pColor,
        size,
        alpha: 1.0,
        decay: Math.random() * 1.6 + 1.4,
        gravity: 90,
      });
    }
  }

  public emitSparks(x: number, y: number, color = '#ffffff', count = 8): void {
    count = this.roomFor(count);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 180 + 50;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        size: Math.floor(Math.random() * 3) * 2 + 4, // 4, 6, 8px
        alpha: 1.0,
        decay: Math.random() * 3.0 + 2.0,
      });
    }
  }

  public emitDockRing(x: number, y: number, color: string): void {
    const n = this.roomFor(16);
    for (let i = 0; i < n; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const speed = 90;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        size: 3.5,
        alpha: 1.0,
        decay: 2.2,
      });
    }
  }

  // ★ ユーザー要望：ドッキング時間切れでミノがシュワーと光の粒子になって消滅するエフェクト
  public emitDissolve(x: number, y: number, width: number, height: number, color: string, count = 35): void {
    count = this.roomFor(count);
    for (let i = 0; i < count; i++) {
      const px = x + Math.random() * width;
      const py = y + Math.random() * height;
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.5; // ふわっと上空へ昇華
      const speed = Math.random() * 80 + 30;
      this.particles.push({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: Math.random() > 0.4 ? color : '#ffffff',
        size: Math.random() * 4 + 2,
        alpha: 1.0,
        decay: Math.random() * 1.2 + 0.8,
      });
    }
  }

  public update(dt: number): void {
    // ★ 性能対策：以前は寿命切れのたびに splice(i, 1) していたため、
    //   粒子が数千個あって同時に大量消滅する場面（＝敵が大量に死ぬ場面）で
    //   配列の詰め直しが O(n^2) になり、1フレーム 150ms 級のスパイクを起こしていた。
    //   生き残りを前から詰め直す1パス方式（O(n)・追加確保なし）に変更。
    //   ついでに画面外へ大きく飛び去った粒子もここで捨てる（描画されないため）。
    const arr = this.particles;
    let w = 0;
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.gravity) {
        p.vy += p.gravity * dt;
      }
      p.alpha -= p.decay * dt;
      if (p.alpha > 0 && p.x > -60 && p.x < CANVAS_WIDTH + 60 && p.y > -60 && p.y < CANVAS_HEIGHT + 60) {
        if (w !== i) arr[w] = p;
        w++;
      }
    }
    arr.length = w;

    // 80年代風パラパラ爆発アニメーション更新
    for (let i = this.retroExplosions.length - 1; i >= 0; i--) {
      const exp = this.retroExplosions[i];
      exp.timer += dt;
      if (exp.timer >= exp.frameDuration) {
        exp.timer = 0;
        exp.frame++;
        if (exp.frame >= exp.maxFrames) {
          exp.isFinished = true;
          this.retroExplosions.splice(i, 1);
        }
      }
    }
  }

  public draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    // 同じ色・同じ不透明度が続く場合は状態変更を省く（粒子1個ごとの set が地味に重いため）
    let lastColor = '';
    let lastAlpha = -1;
    for (const p of this.particles) {
      const a = p.alpha > 1 ? 1 : (p.alpha < 0 ? 0 : Math.round(p.alpha * 8) / 8);
      if (a <= 0) continue;
      if (a !== lastAlpha) {
        ctx.globalAlpha = a;
        lastAlpha = a;
      }
      if (p.color !== lastColor) {
        ctx.fillStyle = p.color;
        lastColor = p.color;
      }
      ctx.fillRect(Math.floor(p.x - p.size / 2), Math.floor(p.y - p.size / 2), p.size, p.size);
    }
    ctx.restore();

    // 80年代名作STG（ギャラガ／ムーンクレスタ風）パラパラ爆発パターン描画
    for (const exp of this.retroExplosions) {
      this.drawRetroExplosionPattern(ctx, exp);
    }
  }

  /**
   * 80年代アーケード完全再現：2〜3パターンの鮮やかなピクセル破片リング爆発
   * フレーム0: 小さな星形コアの閃光破裂（白＋黄）
   * フレーム1: 8方向に飛び散る中型ドット火球（黄＋赤＋青）
   * フレーム2: 大きく広がる放射状リング火花（赤＋シアン＋オレンジ）
   * フレーム3: 散り散りになる最後の火の粉（暗赤＋黄）
   */
  private drawRetroExplosionPattern(ctx: CanvasRenderingContext2D, exp: RetroExplosion): void {
    ctx.save();
    ctx.translate(Math.floor(exp.x), Math.floor(exp.y));
    const s = exp.scale;

    switch (exp.frame) {
      case 0: {
        // パターン1：中心部が激しく閃光破裂
        // 中央の白い核
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-3 * s, -3 * s, 6 * s, 6 * s);

        // 周囲の黄色い十字スパイク
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(-6 * s, -2 * s, 12 * s, 4 * s);
        ctx.fillRect(-2 * s, -6 * s, 4 * s, 12 * s);

        // 4隅の赤ドット
        ctx.fillStyle = '#ff2200';
        ctx.fillRect(-5 * s, -5 * s, 2 * s, 2 * s);
        ctx.fillRect(3 * s, -5 * s, 2 * s, 2 * s);
        ctx.fillRect(-5 * s, 3 * s, 2 * s, 2 * s);
        ctx.fillRect(3 * s, 3 * s, 2 * s, 2 * s);
        break;
      }

      case 1: {
        // パターン2：中型に展開するリング状のピクセル火球（ギャラガ特有の放射パターン）
        // 内側の空洞＋青/黄/赤のドット塊
        const points = [
          // 上下左右
          { x: 0, y: -10, w: 4, h: 4, c: '#ffffff' },
          { x: 0, y: 10, w: 4, h: 4, c: '#ffffff' },
          { x: -10, y: 0, w: 4, h: 4, c: '#ffffff' },
          { x: 10, y: 0, w: 4, h: 4, c: '#ffffff' },
          // 斜め4方向
          { x: -7, y: -7, w: 3, h: 3, c: '#ffcc00' },
          { x: 7, y: -7, w: 3, h: 3, c: '#ffcc00' },
          { x: -7, y: 7, w: 3, h: 3, c: '#ffcc00' },
          { x: 7, y: 7, w: 3, h: 3, c: '#ffcc00' },
          // 中間リング
          { x: -4, y: -4, w: 2, h: 2, c: '#ff2244' },
          { x: 4, y: -4, w: 2, h: 2, c: '#ff2244' },
          { x: -4, y: 4, w: 2, h: 2, c: '#ff2244' },
          { x: 4, y: 4, w: 2, h: 2, c: '#ff2244' },
          // 青い火花（80年代ナムコ特有の鮮やかなアクセント）
          { x: 0, y: -5, w: 2, h: 2, c: '#00ffff' },
          { x: 0, y: 5, w: 2, h: 2, c: '#00ffff' },
          { x: -5, y: 0, w: 2, h: 2, c: '#00ffff' },
          { x: 5, y: 0, w: 2, h: 2, c: '#00ffff' },
        ];

        for (const pt of points) {
          ctx.fillStyle = pt.c;
          ctx.fillRect(pt.x * s, pt.y * s, pt.w * s, pt.h * s);
        }
        break;
      }

      case 2: {
        // パターン3：最大半径に広がってバラバラに散乱するブロック破片
        const outerPoints = [
          // 最外周の破片群
          { x: 0, y: -18, w: 3, h: 3, c: '#ffea00' },
          { x: 0, y: 18, w: 3, h: 3, c: '#ffea00' },
          { x: -18, y: 0, w: 3, h: 3, c: '#ffea00' },
          { x: 18, y: 0, w: 3, h: 3, c: '#ffea00' },
          // 4隅の遠方散乱
          { x: -13, y: -13, w: 3, h: 3, c: '#ff3300' },
          { x: 13, y: -13, w: 3, h: 3, c: '#ff3300' },
          { x: -13, y: 13, w: 3, h: 3, c: '#ff3300' },
          { x: 13, y: 13, w: 3, h: 3, c: '#ff3300' },
          // 中間の赤・シアン・黄ドット
          { x: -8, y: -14, w: 2, h: 2, c: '#00f0ff' },
          { x: 8, y: -14, w: 2, h: 2, c: '#00f0ff' },
          { x: -8, y: 14, w: 2, h: 2, c: '#00f0ff' },
          { x: 8, y: 14, w: 2, h: 2, c: '#00f0ff' },
          { x: -14, y: -8, w: 2, h: 2, c: '#ff0055' },
          { x: 14, y: -8, w: 2, h: 2, c: '#ff0055' },
          { x: -14, y: 8, w: 2, h: 2, c: '#ff0055' },
          { x: 14, y: 8, w: 2, h: 2, c: '#ff0055' },
        ];

        for (const pt of outerPoints) {
          ctx.fillStyle = pt.c;
          ctx.fillRect(pt.x * s, pt.y * s, pt.w * s, pt.h * s);
        }
        break;
      }

      case 3: {
        // パターン4：散り散りになって消えてゆく残火
        const fadingPoints = [
          { x: 0, y: -22, w: 2, h: 2, c: '#ff2200' },
          { x: 0, y: 22, w: 2, h: 2, c: '#ff2200' },
          { x: -22, y: 0, w: 2, h: 2, c: '#ff2200' },
          { x: 22, y: 0, w: 2, h: 2, c: '#ff2200' },
          { x: -16, y: -16, w: 2, h: 2, c: '#ff8800' },
          { x: 16, y: -16, w: 2, h: 2, c: '#ff8800' },
          { x: -16, y: 16, w: 2, h: 2, c: '#ff8800' },
          { x: 16, y: 16, w: 2, h: 2, c: '#ff8800' },
        ];

        for (const pt of fadingPoints) {
          ctx.fillStyle = pt.c;
          ctx.fillRect(pt.x * s, pt.y * s, pt.w * s, pt.h * s);
        }
        break;
      }
    }

    ctx.restore();
  }

  public clear(): void {
    this.particles = [];
    this.retroExplosions = [];
  }
}
