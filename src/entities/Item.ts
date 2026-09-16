import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../config';

export type ItemType = 'BARRIER_ORB' | 'RESCUE_CAPSULE';

export class FieldItem {
  public x: number;
  public y: number;
  public type: ItemType;
  public radius = 16;
  public isDead = false;
  public animTimer = 0;

  // ★ ユーザー要望：まっすぐ落ちるのではなく、左右に大きくサインカーブを描いて落ちてくる。
  //   swayBase は蛇行の中心線（進行方向に直交する軸の基準座標）
  private swayBase: number;
  private swayAmp = 110; // 振れ幅（px）
  private swayFreq = 1.5; // 角速度（rad/秒）
  private swayPhase = Math.random() * Math.PI * 2;
  private swayAxis: 'X' | 'Y' | null = null;

  constructor(x: number, y: number, type: ItemType) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.swayBase = x;
  }

  public update(dt: number, scrollSpeed: number, scrollDir: 'UP' | 'RIGHT' | 'LEFT' | 'DIAGONAL_UP_RIGHT'): void {
    this.animTimer += dt;

    // このフレームのスクロール移動量
    let dx = 0;
    let dy = 0;
    if (scrollDir === 'UP') {
      dy = scrollSpeed * dt;
    } else if (scrollDir === 'RIGHT') {
      dx = -scrollSpeed * dt;
    } else if (scrollDir === 'LEFT') {
      dx = scrollSpeed * dt;
    } else if (scrollDir === 'DIAGONAL_UP_RIGHT') {
      dx = -scrollSpeed * 0.7 * dt;
      dy = scrollSpeed * 0.7 * dt;
    }

    // ★ ユーザー要望：まっすぐ流れるのではなく、進行方向に直交する軸へ
    //   大きくサインカーブを描いて蛇行させる。
    //   横スクロール面では上下に、それ以外（落ちてくる面）では左右に揺れる。
    //   蛇行の中心線（swayBase）だけをスクロールで動かし、表示座標は中心線＋sin で作る。
    if (this.swayAxis === null) {
      this.swayAxis = (scrollDir === 'RIGHT' || scrollDir === 'LEFT') ? 'Y' : 'X';
      this.swayBase = this.swayAxis === 'X' ? this.x : this.y;
    }
    const offset = Math.sin(this.animTimer * this.swayFreq + this.swayPhase) * this.swayAmp;
    if (this.swayAxis === 'X') {
      this.swayBase += dx;
      this.x = Math.min(CANVAS_WIDTH - 20, Math.max(20, this.swayBase + offset));
      this.y += dy;
    } else {
      this.swayBase += dy;
      this.y = Math.min(CANVAS_HEIGHT - 20, Math.max(20, this.swayBase + offset));
      this.x += dx;
    }

    // 画面外へ流れ出たら消滅（スクロール方向の進入側はまだ画面外でも生かしておく）
    const outBottom = this.y > CANVAS_HEIGHT + 40;
    const outTop = this.y < -40;
    const outLeft = this.x < -40;
    const outRight = this.x > CANVAS_WIDTH + 40;
    // ★ バグ修正：従来は上スクロール面でも「画面上端より上」で即消滅していたため、
    //   上空（y<-40）に配置したアイテムが一度も画面に入らず消えていた。進入側では消さない
    if (scrollDir === 'LEFT') {
      if (outRight || outTop || outBottom) this.isDead = true;
    } else if (scrollDir === 'RIGHT') {
      if (outLeft || outTop || outBottom) this.isDead = true;
    } else if (scrollDir === 'DIAGONAL_UP_RIGHT') {
      if (outLeft || outBottom) this.isDead = true;
    } else {
      if (outBottom || outLeft || outRight) this.isDead = true;
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
      if (ctx.roundRect) ctx.roundRect(-14, -14, 28, 28, 6);
      else ctx.rect(-14, -14, 28, 28); // 古いiOS Safari には roundRect が無い
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
