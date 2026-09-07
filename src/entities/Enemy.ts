import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../config';

export type AlienRank =
  | 'GREEN_DRONE'      // 小型グリーン
  | 'RED_GUARD'        // 小型レッド
  | 'YELLOW_COMMANDER' // 小型イエロー
  | 'GIANT_RED'        // ★倍サイズ大型レッド（56px）
  | 'GIANT_YELLOW'     // ★倍サイズ大型イエロー（64px）
  | 'UFO_MOTHERSHIP';  // ★超大型ボスUFO（90px）

export type FlightPattern =
  | 'FORMATION_LOOP'      // ギャラガ風宙返り入場 → 整列
  | 'SWEEP_FROM_LEFT'     // 画面左から横断進入
  | 'SWEEP_FROM_RIGHT'    // 画面右から横断進入
  | 'SURPRISE_FROM_BOTTOM'// 画面下から急上昇突き上げ！
  | 'CAROUSEL_CIRCLE'     // 画面中央大車輪旋回
  | 'IN_FORMATION'        // 隊列波打ち待機
  | 'KAMIKAZE_DIVE'       // ムーンクレスタ風宙返り急降下体当たり！
  | 'RETURNING';          // 上空隊列復帰

export class Enemy {
  public id: string;
  public x: number;
  public y: number;
  public vx = 0;
  public vy = 0;
  public width: number;
  public height: number;
  public rank: AlienRank;
  public pattern: FlightPattern;
  public hp: number;
  public maxHp: number;
  public scoreValue: number;
  public isDead = false;

  // 隊列座標
  public formationX: number;
  public formationY: number;

  private animFrame = 0;
  private animTimer = 0;
  private timeAlive = 0;
  private patternTimer = 0;
  private flashTime = 0;

  // 旋回・アタック軌道パラメータ
  private circleCenterX = CANVAS_WIDTH / 2;
  private circleCenterY = CANVAS_HEIGHT * 0.4;
  private circleRadius = 140;
  private circleAngle = 0;
  private diveAngle = 0;
  private diveTargetX = CANVAS_WIDTH / 2;
  private diveTargetY = CANVAS_HEIGHT;

  constructor(
    rank: AlienRank,
    pattern: FlightPattern,
    formationCol: number,
    formationRow: number,
    spawnDelay = 0,
    customStartX?: number,
    customStartY?: number
  ) {
    this.id = Math.random().toString(36).substring(2, 9);
    this.rank = rank;
    this.pattern = pattern;
    this.patternTimer = -spawnDelay;

    // 隊列スロット位置（画面全体に美しく配置）
    const spacingX = 42;
    const spacingY = 36;
    this.formationX = CANVAS_WIDTH / 2 + (formationCol - 4.5) * spacingX;
    this.formationY = 70 + formationRow * spacingY;

    // サイズ・HP・スコア設定（倍サイズも実装！）
    switch (rank) {
      case 'GREEN_DRONE':
        this.width = 24;
        this.height = 22;
        this.maxHp = 1;
        this.scoreValue = 100;
        break;
      case 'RED_GUARD':
        this.width = 26;
        this.height = 24;
        this.maxHp = 2;
        this.scoreValue = 200;
        break;
      case 'YELLOW_COMMANDER':
        this.width = 30;
        this.height = 26;
        this.maxHp = 3;
        this.scoreValue = 400;
        break;
      case 'GIANT_RED': // ★倍サイズ大型レッド
        this.width = 54;
        this.height = 50;
        this.maxHp = 8;
        this.scoreValue = 1200;
        break;
      case 'GIANT_YELLOW': // ★倍サイズ大型イエロー旗艦
        this.width = 64;
        this.height = 56;
        this.maxHp = 12;
        this.scoreValue = 1800;
        break;
      case 'UFO_MOTHERSHIP': // ★超大型ボスUFO
        this.width = 92;
        this.height = 58;
        this.maxHp = 35;
        this.scoreValue = 5000;
        break;
    }
    this.hp = this.maxHp;

    // 出現初期位置のバリエーション
    if (customStartX !== undefined && customStartY !== undefined) {
      this.x = customStartX;
      this.y = customStartY;
    } else {
      switch (pattern) {
        case 'SWEEP_FROM_LEFT':
          this.x = -this.width - 20;
          this.y = 120 + formationRow * 40;
          this.vx = 220;
          this.vy = 40;
          break;
        case 'SWEEP_FROM_RIGHT':
          this.x = CANVAS_WIDTH + 20;
          this.y = 120 + formationRow * 40;
          this.vx = -220;
          this.vy = 40;
          break;
        case 'SURPRISE_FROM_BOTTOM':
          // 画面下から急上昇！
          this.x = this.formationX;
          this.y = CANVAS_HEIGHT + 30;
          this.vy = -340;
          this.vx = (Math.random() - 0.5) * 80;
          break;
        case 'CAROUSEL_CIRCLE':
          this.circleAngle = (formationCol / 10) * Math.PI * 2;
          this.x = this.circleCenterX + Math.cos(this.circleAngle) * this.circleRadius;
          this.y = this.circleCenterY + Math.sin(this.circleAngle) * this.circleRadius;
          break;
        default:
          // 上空左右からループ進入
          this.x = formationCol < 5 ? -30 : CANVAS_WIDTH + 30;
          this.y = -40;
          break;
      }
    }
  }

  public update(
    dt: number,
    formationOffsetAngle: number,
    playerX: number,
    playerY: number,
    canDive: boolean
  ): void {
    this.timeAlive += dt;
    this.patternTimer += dt;
    if (this.flashTime > 0) this.flashTime -= dt;

    // 2フレームアニメーション
    this.animTimer += dt;
    if (this.animTimer >= 0.22) {
      this.animTimer = 0;
      this.animFrame = 1 - this.animFrame;
    }

    // スポーン待機中
    if (this.patternTimer < 0) return;

    switch (this.pattern) {
      // 1. ギャラガ風宙返り入場
      case 'FORMATION_LOOP': {
        const dx = this.formationX - this.x;
        const dy = this.formationY - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 10) {
          this.x = this.formationX;
          this.y = this.formationY;
          this.pattern = 'IN_FORMATION';
          this.patternTimer = Math.random() * 3;
        } else {
          const speed = 240;
          this.x += (dx / dist) * speed * dt;
          this.y += (dy / dist) * speed * dt;
        }
        break;
      }

      // 2. 画面左端からの横断編隊
      case 'SWEEP_FROM_LEFT': {
        this.x += this.vx * dt;
        this.y += Math.sin(this.timeAlive * 5) * 110 * dt;
        if (this.x > CANVAS_WIDTH + 30) {
          this.pattern = 'FORMATION_LOOP';
        }
        break;
      }

      // 3. 画面右端からの横断編隊
      case 'SWEEP_FROM_RIGHT': {
        this.x += this.vx * dt;
        this.y += Math.sin(this.timeAlive * 5) * 110 * dt;
        if (this.x < -this.width - 30) {
          this.pattern = 'FORMATION_LOOP';
        }
        break;
      }

      // 4. 画面下からの急上昇サプライズ突進！
      case 'SURPRISE_FROM_BOTTOM': {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        // 上空まで突き抜けたら隊列へ
        if (this.y < 90) {
          this.pattern = 'FORMATION_LOOP';
        }
        break;
      }

      // 5. 大車輪カルーセル旋回
      case 'CAROUSEL_CIRCLE': {
        this.circleAngle += 2.2 * dt;
        this.x = this.circleCenterX + Math.cos(this.circleAngle) * this.circleRadius;
        this.y = this.circleCenterY + Math.sin(this.circleAngle) * this.circleRadius;

        if (this.patternTimer > 5.0) {
          this.pattern = 'KAMIKAZE_DIVE';
          this.diveTargetX = playerX;
          this.diveTargetY = playerY;
          this.diveAngle = -Math.PI / 2;
        }
        break;
      }

      // 6. 隊列待機（ゆらゆら波打ち）
      case 'IN_FORMATION': {
        const waveX = Math.sin(formationOffsetAngle) * 22;
        const waveY = Math.cos(formationOffsetAngle * 2) * 6;
        this.x = this.formationX + waveX;
        this.y = this.formationY + waveY;

        // 隊列から離脱してムーンクレスタ風体当たりダイブ！
        if (canDive && this.patternTimer > 3.0 + Math.random() * 4.0) {
          this.pattern = 'KAMIKAZE_DIVE';
          this.patternTimer = 0;
          this.diveAngle = -Math.PI / 2;
          this.diveTargetX = playerX;
          this.diveTargetY = playerY;
        }
        break;
      }

      // 7. ムーンクレスタ風 宙返り急降下体当たり突進（弾なし・体当たりのみ！）
      case 'KAMIKAZE_DIVE': {
        if (this.patternTimer < 0.6) {
          // 宙返り旋回ループ
          this.diveAngle += 10.0 * dt;
          this.x += Math.cos(this.diveAngle) * 160 * dt;
          this.y += Math.sin(this.diveAngle) * 160 * dt;
        } else {
          // 自機へ向かって超高速ダイブ！
          const dx = this.diveTargetX - this.x;
          const dy = (this.diveTargetY + 60) - this.y;
          const dist = Math.hypot(dx, dy) || 1;
          const speed = 250 + (this.rank.startsWith('GIANT') ? 60 : 30);
          this.x += (dx / dist) * speed * dt;
          this.y += Math.max(120, (dy / dist) * speed) * dt;

          // 画面下へ抜けたら上空から隊列復帰
          if (this.y > CANVAS_HEIGHT + 30) {
            this.y = -40;
            this.x = this.formationX;
            this.pattern = 'RETURNING';
          }
        }
        break;
      }

      // 8. 隊列復帰
      case 'RETURNING': {
        const dx = this.formationX - this.x;
        const dy = this.formationY - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 10) {
          this.pattern = 'IN_FORMATION';
          this.patternTimer = 0;
        } else {
          this.x += (dx / dist) * 180 * dt;
          this.y += (dy / dist) * 180 * dt;
        }
        break;
      }
    }
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

  // 往年の原色ピクセルアート描画（倍サイズも忠実にスケーリング！）
  public draw(ctx: CanvasRenderingContext2D): void {
    if (this.y < -60 || this.y > CANVAS_HEIGHT + 60) return;

    ctx.save();
    const cx = Math.floor(this.x + this.width / 2);
    const cy = Math.floor(this.y + this.height / 2);

    if (this.flashTime > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(this.x, this.y, this.width, this.height);
      ctx.restore();
      return;
    }

    const f = this.animFrame; // 0 or 1
    const isGiant = this.rank === 'GIANT_RED' || this.rank === 'GIANT_YELLOW' || this.rank === 'UFO_MOTHERSHIP';
    const s = isGiant ? 2.0 : 1.0; // 倍率スケール

    ctx.translate(cx, cy);
    ctx.scale(s, s);

    switch (this.rank) {
      case 'GREEN_DRONE': {
        // グリーンエイリアン
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(-7, -10, 3, 4);
        ctx.fillRect(4, -10, 3, 4);
        ctx.fillStyle = '#00ee22';
        ctx.fillRect(-8, -6, 16, 8);
        ctx.fillStyle = '#00aaff';
        if (f === 0) {
          ctx.fillRect(-12, -4, 4, 8);
          ctx.fillRect(8, -4, 4, 8);
        } else {
          ctx.fillRect(-11, -8, 4, 8);
          ctx.fillRect(7, -8, 4, 8);
        }
        ctx.fillStyle = '#ff0033';
        ctx.fillRect(-5, -2, 3, 3);
        ctx.fillRect(2, -2, 3, 3);
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(-3, 3, 6, 4);
        break;
      }

      case 'RED_GUARD':
      case 'GIANT_RED': {
        // レッドガード（倍サイズGIANT_REDも同じ美しいピクセル比率！）
        ctx.fillStyle = '#ff1133';
        if (f === 0) {
          ctx.fillRect(-13, -6, 6, 10);
          ctx.fillRect(7, -6, 6, 10);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-11, -4, 3, 6);
          ctx.fillRect(8, -4, 3, 6);
        } else {
          ctx.fillRect(-12, -10, 6, 11);
          ctx.fillRect(6, -10, 6, 11);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-10, -8, 3, 7);
          ctx.fillRect(7, -8, 3, 7);
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-4, -8, 8, 14);
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(-2, -4, 4, 6);
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(-3, -6, 2, 2);
        ctx.fillRect(1, -6, 2, 2);
        break;
      }

      case 'YELLOW_COMMANDER':
      case 'GIANT_YELLOW': {
        // イエロー旗艦（倍サイズGIANT_YELLOW対応）
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(-14, -12, 5, 8);
        ctx.fillRect(9, -12, 5, 8);
        ctx.fillStyle = '#0055ff';
        ctx.fillRect(-10, -6, 20, 10);
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(-6, -4, 12, 8);
        ctx.fillStyle = '#ff2244';
        if (f === 0) {
          ctx.fillRect(-14, -1, 4, 7);
          ctx.fillRect(10, -1, 4, 7);
        } else {
          ctx.fillRect(-15, -5, 4, 8);
          ctx.fillRect(11, -5, 4, 8);
        }
        ctx.fillStyle = '#ff0033';
        ctx.fillRect(-3, -2, 6, 4);
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(-1, -1, 2, 2);
        break;
      }

      case 'UFO_MOTHERSHIP': {
        // 超大型クラシックUFO母船
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(-12, -14, 24, 7);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-8, -12, 16, 4);

        ctx.fillStyle = '#ff0044';
        ctx.fillRect(-22, -7, 44, 11);
        ctx.fillRect(-16, 4, 32, 6);

        ctx.fillStyle = f === 0 ? '#ffea00' : '#00ff66';
        ctx.fillRect(-18, -4, 5, 5);
        ctx.fillRect(-7, -4, 5, 5);
        ctx.fillRect(3, -4, 5, 5);
        ctx.fillRect(14, -4, 5, 5);

        ctx.fillStyle = '#ffaa00';
        ctx.fillRect(-11, 10, 22, 4);
        break;
      }
    }

    // 大型機のHPバー
    if (isGiant) {
      const hpRatio = Math.max(0, this.hp / this.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(-18, -20, 36, 4);
      ctx.fillStyle = hpRatio > 0.3 ? '#00ff88' : '#ff0033';
      ctx.fillRect(-18, -20, 36 * hpRatio, 4);
    }

    ctx.restore();
  }
}
