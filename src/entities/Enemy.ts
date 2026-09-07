import { BLOCK_SIZE, CANVAS_HEIGHT, LEFT_WALL_COL, RIGHT_WALL_COL } from '../config';
import { EnemyBullet } from './Bullet';
import { WallManager } from './Wall';

export type EnemyType = 'BEE' | 'BUTTERFLY' | 'BOSS';
export type MovementPattern = 'SINE' | 'LOOP_DIVE' | 'DIAGONAL' | 'STRAIGHT' | 'BOSS_PATTERN';

export class Enemy {
  public x: number;
  public y: number;
  public vx: number;
  public vy: number;
  public width: number;
  public height: number;
  public type: EnemyType;
  public pattern: MovementPattern;
  public hp: number;
  public maxHp: number;
  public scoreValue: number;
  public isDead = false;

  private timeAlive = 0;
  private startX: number;
  private shootCooldown: number;
  private flashTime = 0;

  constructor(
    type: EnemyType,
    pattern: MovementPattern,
    x: number,
    y: number,
    hpMultiplier = 1.0
  ) {
    this.type = type;
    this.pattern = pattern;
    this.x = x;
    this.y = y;
    this.startX = x;

    switch (type) {
      case 'BEE': // ザコ蜂（黄・青）
        this.width = 24;
        this.height = 24;
        this.maxHp = Math.max(1, Math.round(1 * hpMultiplier));
        this.scoreValue = 100;
        this.shootCooldown = Math.random() * 3 + 2;
        this.vx = 80;
        this.vy = 100;
        break;
      case 'BUTTERFLY': // 蝶（赤・白）
        this.width = 28;
        this.height = 26;
        this.maxHp = Math.max(2, Math.round(2 * hpMultiplier));
        this.scoreValue = 200;
        this.shootCooldown = Math.random() * 2.5 + 1.5;
        this.vx = 110;
        this.vy = 120;
        break;
      case 'BOSS': // ボスエイリアン（緑・青・黄の大型機）
        this.width = 64;
        this.height = 54;
        this.maxHp = Math.max(25, Math.round(30 * hpMultiplier));
        this.scoreValue = 2000;
        this.shootCooldown = 1.2;
        this.vx = 90;
        this.vy = 30;
        break;
    }
    this.hp = this.maxHp;
  }

  public update(dt: number, wallManager: WallManager, playerX: number, playerY: number): EnemyBullet[] {
    this.timeAlive += dt;
    if (this.flashTime > 0) this.flashTime -= dt;

    const newBullets: EnemyBullet[] = [];

    // 移動パターンの更新
    switch (this.pattern) {
      case 'SINE': {
        // サイン波で左右に揺れながら降下
        this.y += this.vy * dt;
        this.x = this.startX + Math.sin(this.timeAlive * 3.5) * 60;
        break;
      }
      case 'LOOP_DIVE': {
        // ギャラガ名物：上空で円旋回してから急降下
        if (this.timeAlive < 1.2) {
          const angle = this.timeAlive * 5.0;
          this.x = this.startX + Math.cos(angle) * 45;
          this.y += 35 * dt + Math.sin(angle) * 40 * dt;
        } else {
          // 自機へ向かってダイブ突進
          this.y += (this.vy * 1.6) * dt;
          this.x += this.vx * 0.7 * dt;
        }
        break;
      }
      case 'DIAGONAL': {
        // 斜めにジグザグ移動
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        break;
      }
      case 'STRAIGHT': {
        // 直線降下
        this.y += this.vy * 1.3 * dt;
        break;
      }
      case 'BOSS_PATTERN': {
        // 上部を左右に遊弋しながら猛烈な弾幕
        if (this.y < 120) {
          this.y += 60 * dt;
        }
        this.x += this.vx * dt;
        break;
      }
    }

    // 壁（基本壁＋防壁ミノ）とのコリジョン＆遮り処理
    // 「左右の壁には当たらないように落ちてくるが、もし壁にテトリミノを引っ付けてある場合はそこが壁として、敵はそこで遮られて動きを変えられる」
    const minWallX = (LEFT_WALL_COL + 1) * BLOCK_SIZE;
    const maxWallX = RIGHT_WALL_COL * BLOCK_SIZE - this.width;

    // 基本壁での反射
    if (this.x <= minWallX) {
      this.x = minWallX;
      this.vx = Math.abs(this.vx);
      this.startX = this.x;
    } else if (this.x >= maxWallX) {
      this.x = maxWallX;
      this.vx = -Math.abs(this.vx);
      this.startX = this.x;
    }

    // 防壁ミノとの衝突判定
    const leftGx = Math.floor(this.x / BLOCK_SIZE);
    const rightGx = Math.floor((this.x + this.width) / BLOCK_SIZE);
    const topGy = Math.floor(this.y / BLOCK_SIZE);
    const bottomGy = Math.floor((this.y + this.height) / BLOCK_SIZE);

    for (let gy = topGy; gy <= bottomGy; gy++) {
      for (let gx = leftGx; gx <= rightGx; gx++) {
        if (wallManager.hasBlock(gx, gy)) {
          // 壁に遮られた！速度を反転させ、進路を変える
          this.vx = -this.vx;
          this.startX = this.x;
          // 防壁にも微細な衝撃
          wallManager.damageAt(gx, gy, 0.2);
          break;
        }
      }
    }

    // 画面下部に消えたら終了
    if (this.y > CANVAS_HEIGHT + 60) {
      this.isDead = true;
    }

    // 弾の発射ロジック
    this.shootCooldown -= dt;
    if (this.shootCooldown <= 0 && this.y > 40 && this.y < CANVAS_HEIGHT - 120) {
      if (this.type === 'BOSS') {
        // ボスは3WAY弾
        newBullets.push(new EnemyBullet(this.x + this.width / 2, this.y + this.height, playerX, playerY));
        newBullets.push(new EnemyBullet(this.x + 10, this.y + this.height, playerX - 60, playerY));
        newBullets.push(new EnemyBullet(this.x + this.width - 10, this.y + this.height, playerX + 60, playerY));
        this.shootCooldown = 1.3;
      } else {
        // ザコ・中型は単発狙い撃ちまたは直下弾
        newBullets.push(new EnemyBullet(this.x + this.width / 2, this.y + this.height, playerX, playerY));
        this.shootCooldown = Math.random() * 3.0 + 2.0;
      }
    }

    return newBullets;
  }

  public hit(damage = 1): boolean {
    this.hp -= damage;
    this.flashTime = 0.12;
    if (this.hp <= 0) {
      this.isDead = true;
      return true;
    }
    return false;
  }

  // ギャラガ風のレトロピクセルエイリアン描画
  public draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;

    if (this.flashTime > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(this.x, this.y, this.width, this.height);
      ctx.restore();
      return;
    }

    if (this.type === 'BEE') {
      // 黄色と青の蜂型エイリアン
      ctx.fillStyle = '#ffcc00';
      // 羽の羽ばたきアニメ
      const flap = Math.sin(this.timeAlive * 18) * 4;
      ctx.fillRect(cx - 10, cy - 8 + flap, 5, 10);
      ctx.fillRect(cx + 5, cy - 8 - flap, 5, 10);
      // 胴体
      ctx.fillStyle = '#0088ff';
      ctx.fillRect(cx - 6, cy - 6, 12, 12);
      ctx.fillStyle = '#ffcc00';
      ctx.fillRect(cx - 4, cy - 4, 8, 8);
      // 目
      ctx.fillStyle = '#ff0033';
      ctx.fillRect(cx - 4, cy + 3, 3, 3);
      ctx.fillRect(cx + 1, cy + 3, 3, 3);
    } else if (this.type === 'BUTTERFLY') {
      // 赤と白の蝶型エイリアン
      const flap = Math.sin(this.timeAlive * 16) * 5;
      ctx.fillStyle = '#ff2244';
      ctx.beginPath();
      ctx.ellipse(cx - 9, cy, 6, 9 + flap, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 9, cy, 6, 9 - flap, 0, 0, Math.PI * 2);
      ctx.fill();

      // 中央コア
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 4, cy - 7, 8, 14);
      ctx.fillStyle = '#00ffff';
      ctx.fillRect(cx - 2, cy - 3, 4, 6);
    } else {
      // BOSS ギャラガ風巨大旗艦
      ctx.fillStyle = '#22aa33';
      ctx.fillRect(cx - 28, cy - 18, 56, 36);

      // 角／爪
      ctx.fillStyle = '#0055ff';
      ctx.fillRect(cx - 32, cy - 24, 10, 20);
      ctx.fillRect(cx + 22, cy - 24, 10, 20);

      // コアアイ
      ctx.fillStyle = '#ffea00';
      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();

      // HPゲージ（ボス頭上）
      const hpRatio = Math.max(0, this.hp / this.maxHp);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(cx - 25, this.y - 10, 50, 5);
      ctx.fillStyle = hpRatio > 0.3 ? '#00ff88' : '#ff2244';
      ctx.fillRect(cx - 25, this.y - 10, 50 * hpRatio, 5);
    }

    ctx.restore();
  }
}
