import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../config';

export type AlienRank =
  | 'GREEN_DRONE'      // 小型グリーン
  | 'RED_GUARD'        // 小型レッド
  | 'YELLOW_COMMANDER' // 小型イエロー
  | 'GIANT_RED'        // 倍サイズ大型レッド
  | 'GIANT_YELLOW'     // 倍サイズ大型イエロー
  | 'UFO_MOTHERSHIP'   // 超大型ボスUFO
  | 'METEOR_ROCK'      // ★ ムーンクレスタ名物：隕石メテオ（硬くて回転しながら急降下！）
  | 'SPLITTING_EYE'    // ★ ムーンクレスタ名物：撃つと2つに分裂する不規則移動の目玉怪獣
  | 'MINI_EYE'         // ★ 分裂した小型目玉
  | 'TOROID_SCOUT';    // ★ ゼビウス風トーロイド

export type CurvePathType =
  | 'FIGURE_EIGHT'         // ギャラガ8の字ループ
  | 'S_CURVE_LEFT_TO_RIGHT'// 左から右へのS字蛇行
  | 'S_CURVE_RIGHT_TO_LEFT'// 右から左へのS字蛇行
  | 'INFINITY_DIVE_LEFT'   // 左からの宙返り急降下
  | 'INFINITY_DIVE_RIGHT';  // 右からの宙返り急降下

export type FlightPattern =
  | 'STREAM_CURVE'        // ★ ギャプラス風・曲線を描いて連なる大編隊！
  | 'FORMATION_LOOP'
  | 'SWEEP_FROM_LEFT'
  | 'SWEEP_FROM_RIGHT'
  | 'SURPRISE_FROM_BOTTOM'
  | 'CAROUSEL_CIRCLE'
  | 'IN_FORMATION'
  | 'KAMIKAZE_DIVE'
  | 'RETURNING'
  | 'METEOR_FALL'         // ★ ムーンクレスタ風：隕石・メテオ群（上から高速降下）
  | 'ZIGZAG_DIVE'         // ★ ムーンクレスタ風：カミソリ急降下（電光石火の左右切り返し）
  | 'CROSS_SPLIT'         // ★ 左右斜め上から中央交差突入
  | 'MOON_SPLIT_FLOAT'    // ★ ムーンクレスタ風：カクカク不規則に左右に振れながら降下
  | 'XEVIOUS_TOROID'      // ★ ゼビウス風：直角クランク移動で画面をクロス
  | 'STARFORCE_SWOOP';    // ★ スターフォース風：超高速ダイナミック全画面ダイブ＆旋回

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
  public isBoss = false;

  public formationX: number;
  public formationY: number;

  // ストリーム曲線編隊パラメータ
  public curveType?: CurvePathType;
  public streamDelay = 0; // 連隊内の順番ディレイ (0.12秒刻み)
  public streamProgress = 0;

  private animFrame = 0;
  private animTimer = 0;
  private timeAlive = 0;
  private patternTimer = 0;
  private flashTime = 0;

  private circleCenterX = CANVAS_WIDTH / 2;
  private circleCenterY = CANVAS_HEIGHT * 0.38;
  private circleRadius = 145;
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
    curveType?: CurvePathType,
    streamIndex = 0,
    isBoss = false,
    customHp?: number
  ) {
    this.id = Math.random().toString(36).substring(2, 9);
    this.rank = rank;
    this.pattern = pattern;
    this.patternTimer = -spawnDelay;
    this.curveType = curveType;
    this.streamDelay = streamIndex * 0.11; // 1機ごとの美しい等間隔
    this.streamProgress = -this.streamDelay;
    this.isBoss = isBoss;

    const spacingX = 46;
    const spacingY = 40;
    this.formationX = CANVAS_WIDTH / 2 + (formationCol - 4.5) * spacingX;
    this.formationY = 65 + formationRow * spacingY;

    // 敵サイズ（一回り大きく迫力満点！）
    switch (rank) {
      case 'GREEN_DRONE':
        this.width = 34;
        this.height = 30;
        this.maxHp = 1;
        this.scoreValue = 100;
        break;
      case 'RED_GUARD':
        this.width = 38;
        this.height = 34;
        this.maxHp = 1;
        this.scoreValue = 200;
        break;
      case 'YELLOW_COMMANDER':
        this.width = 44;
        this.height = 38;
        this.maxHp = 1;
        this.scoreValue = 400;
        break;
      case 'GIANT_RED':
        this.width = 72;
        this.height = 66;
        this.maxHp = 1;
        this.scoreValue = 800;
        break;
      case 'GIANT_YELLOW':
        this.width = 84;
        this.height = 74;
        this.maxHp = 1;
        this.scoreValue = 1200;
        break;
      case 'UFO_MOTHERSHIP':
        this.width = 124;
        this.height = 78;
        this.maxHp = 24; // 固いボスUFO！
        this.scoreValue = 5000;
        break;
      case 'METEOR_ROCK':
        this.width = 42;
        this.height = 42;
        this.maxHp = 3; // 隕石は頑丈（3発）
        this.scoreValue = 300;
        break;
      case 'SPLITTING_EYE':
        this.width = 46;
        this.height = 42;
        this.maxHp = 1; // 1発で2つのMINI_EYEに分裂
        this.scoreValue = 500;
        break;
      case 'MINI_EYE':
        this.width = 24;
        this.height = 22;
        this.maxHp = 1;
        this.scoreValue = 250;
        break;
      case 'TOROID_SCOUT':
        this.width = 32;
        this.height = 32;
        this.maxHp = 1;
        this.scoreValue = 350;
        break;
    }
    if (this.isBoss) {
      // ユーザー要望：ボスの大きさを2倍に巨大化！
      this.width *= 2;
      this.height *= 2;
    }
    if (customHp !== undefined) {
      this.maxHp = customHp;
    }
    this.hp = this.maxHp;

    if (pattern === 'SWEEP_FROM_LEFT') {
      this.x = -this.width - 20;
      this.y = this.formationY;
      this.vx = 125; // 落ち着いた速度で横断
    } else if (pattern === 'SWEEP_FROM_RIGHT') {
      this.x = CANVAS_WIDTH + 20;
      this.y = this.formationY;
      this.vx = -125;
    } else if (pattern === 'SURPRISE_FROM_BOTTOM') {
      this.x = this.formationX;
      this.y = CANVAS_HEIGHT + 30;
      this.vx = 0;
      this.vy = -150; // 急上昇
    } else if (pattern === 'METEOR_FALL') {
      this.x = this.formationX;
      this.y = -60;
      this.vx = (Math.random() - 0.5) * 40;
      this.vy = 210; // ムーンクレスタ名物：超高速隕石落下！
    } else if (pattern === 'ZIGZAG_DIVE') {
      this.x = this.formationX;
      this.y = -50;
      this.vx = 180;
      this.vy = 120;
    } else if (pattern === 'MOON_SPLIT_FLOAT') {
      this.x = this.formationX;
      this.y = -40;
      this.vx = (Math.random() > 0.5 ? 1 : -1) * 80;
      this.vy = 45; // ゆっくりカクカク不規則降下
    } else if (pattern === 'XEVIOUS_TOROID') {
      this.x = Math.random() > 0.5 ? -30 : CANVAS_WIDTH + 30;
      this.y = 80 + Math.random() * 200;
      this.vx = this.x < 0 ? 140 : -140;
      this.vy = 0;
    } else if (pattern === 'STARFORCE_SWOOP') {
      this.x = Math.random() > 0.5 ? 40 : CANVAS_WIDTH - 40;
      this.y = -40;
      this.vx = (Math.random() - 0.5) * 200;
      this.vy = 220; // 超高速急降下
    } else if (pattern === 'CROSS_SPLIT') {
      this.x = formationCol < 4 ? -40 : CANVAS_WIDTH + 40;
      this.y = -40;
      this.vx = formationCol < 4 ? 140 : -140;
      this.vy = 130;
    } else {
      this.x = -100;
      this.y = -100;
    }
  }

  public update(
    dt: number,
    formationOffsetAngle: number,
    playerX: number,
    playerY: number,
    canDive: boolean
  ): boolean {
    let justStartedDive = false;
    this.timeAlive += dt;
    this.patternTimer += dt;
    if (this.flashTime > 0) this.flashTime -= dt;

    if (this.patternTimer < 0) {
      // 出現待機中は初期画面外位置に留める
      if (this.pattern === 'SWEEP_FROM_LEFT') {
        this.x = -this.width - 20;
        this.y = this.formationY;
      } else if (this.pattern === 'SWEEP_FROM_RIGHT') {
        this.x = CANVAS_WIDTH + 20;
        this.y = this.formationY;
      } else if (this.pattern === 'SURPRISE_FROM_BOTTOM') {
        this.x = this.formationX;
        this.y = CANVAS_HEIGHT + 30;
      } else if (this.pattern === 'METEOR_FALL') {
        this.x = this.formationX;
        this.y = -60;
      } else if (this.pattern === 'ZIGZAG_DIVE') {
        this.x = this.formationX;
        this.y = -50;
      } else if (this.pattern === 'CROSS_SPLIT') {
        this.x = this.formationX < CANVAS_WIDTH / 2 ? -40 : CANVAS_WIDTH + 40;
        this.y = -40;
      } else {
        this.x = -100;
        this.y = -100;
      }
      return false;
    }

    if (this.animTimer >= 0.22) {
      this.animTimer = 0;
      this.animFrame = 1 - this.animFrame;
    }

    switch (this.pattern) {
      // ★ ギャプラス＆ギャラガ完全再現：曲線で連なって流れる美しい大編隊！
      case 'STREAM_CURVE': {
        this.streamProgress += dt * 0.55; // 進行速度（ギャラガ風の落ち着いた流麗なスピード）
        const t = this.streamProgress;

        if (t < 0) {
          this.x = -100;
          this.y = -100;
          return false;
        }

        const pos = this.computeCurvePosition(t, this.curveType || 'FIGURE_EIGHT');
        this.x = pos.x;
        this.y = pos.y;

        // 曲線飛行が完了したら隊列へ合流！
        if (t >= 4.2) {
          this.pattern = 'FORMATION_LOOP';
        }
        break;
      }

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
          const speed = 140; // 落ち着いた隊列復帰速度
          this.x += (dx / dist) * speed * dt;
          this.y += (dy / dist) * speed * dt;
        }
        break;
      }

      case 'SWEEP_FROM_LEFT': {
        this.x += this.vx * dt;
        this.y += Math.sin(this.timeAlive * 3) * 60 * dt;
        if (this.x > CANVAS_WIDTH + 30) {
          this.pattern = 'FORMATION_LOOP';
        }
        break;
      }

      case 'SWEEP_FROM_RIGHT': {
        this.x += this.vx * dt;
        this.y += Math.sin(this.timeAlive * 3) * 60 * dt;
        if (this.x < -this.width - 30) {
          this.pattern = 'FORMATION_LOOP';
        }
        break;
      }

      case 'SURPRISE_FROM_BOTTOM': {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        if (this.y < 90) {
          this.pattern = 'FORMATION_LOOP';
        }
        break;
      }

      case 'CAROUSEL_CIRCLE': {
        this.circleAngle += 1.3 * dt;
        this.x = this.circleCenterX + Math.cos(this.circleAngle) * this.circleRadius;
        this.y = this.circleCenterY + Math.sin(this.circleAngle) * this.circleRadius;

        if (this.patternTimer > 6.0) {
          this.pattern = 'KAMIKAZE_DIVE';
          this.diveTargetX = playerX;
          this.diveTargetY = playerY;
          this.diveAngle = -Math.PI / 2;
        }
        break;
      }

      case 'IN_FORMATION': {
        const waveX = Math.sin(formationOffsetAngle) * 22;
        const waveY = Math.cos(formationOffsetAngle * 2) * 6;
        this.x = this.formationX + waveX;
        this.y = this.formationY + waveY;

        // 隊列から離脱して体当たり急降下！
        if (canDive && this.patternTimer > 3.0 + Math.random() * 4.0) {
          this.pattern = 'KAMIKAZE_DIVE';
          this.patternTimer = 0;
          this.diveAngle = -Math.PI / 2;
          this.diveTargetX = playerX;
          this.diveTargetY = playerY;
          justStartedDive = true;
        }
        break;
      }

      case 'KAMIKAZE_DIVE': {
        if (this.patternTimer < 0.6) {
          this.diveAngle += 6.0 * dt;
          this.x += Math.cos(this.diveAngle) * 90 * dt;
          this.y += Math.sin(this.diveAngle) * 90 * dt;
        } else {
          const dx = this.diveTargetX - this.x;
          const dy = (this.diveTargetY + 60) - this.y;
          const dist = Math.hypot(dx, dy) || 1;
          const speed = 150 + (this.rank.startsWith('GIANT') ? 30 : 15);
          this.x += (dx / dist) * speed * dt;
          this.y += Math.max(70, (dy / dist) * speed) * dt;

          if (this.y > CANVAS_HEIGHT + 30) {
            this.y = -40;
            this.x = this.formationX;
            this.pattern = 'RETURNING';
          }
        }
        break;
      }

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

      // ★ ムーンクレスタ名物：隕石・メテオ群（上から高速降下して底を抜けたら上に戻る）
      case 'METEOR_FALL': {
        this.y += this.vy * dt;
        this.x += Math.sin(this.timeAlive * 5) * 45 * dt;
        if (this.y > CANVAS_HEIGHT + 30) {
          this.y = -60;
          this.x = this.formationX + (Math.random() - 0.5) * 60;
        }
        break;
      }

      // ★ ムーンクレスタ名物：カミソリ急降下（電光石火の左右切り返しジグザグ）
      case 'ZIGZAG_DIVE': {
        this.y += this.vy * dt;
        // 高速な三角波的左右往復
        const zig = Math.sin(this.timeAlive * 4.5);
        this.x += zig * this.vx * dt;
        if (this.y > CANVAS_HEIGHT + 30) {
          this.y = -50;
          this.x = this.formationX;
        }
        break;
      }

      // ★ 左右斜め上から中央に突入して交差するスプリット
      case 'CROSS_SPLIT': {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        if (this.y > CANVAS_HEIGHT + 30 || this.x < -60 || this.x > CANVAS_WIDTH + 60) {
          this.pattern = 'FORMATION_LOOP';
        }
        break;
      }

      // ★ ムーンクレスタ風：カクカク不規則移動で左右に揺れながら降下
      case 'MOON_SPLIT_FLOAT': {
        this.y += this.vy * dt;
        // 不規則なカクカクステップ移動
        const stepPeriod = Math.floor(this.timeAlive * 3.5);
        const dir = (stepPeriod % 2 === 0) ? 1 : -1;
        this.x += dir * Math.abs(this.vx) * dt;

        if (this.x < 30) this.vx = Math.abs(this.vx);
        if (this.x > CANVAS_WIDTH - 30 - this.width) this.vx = -Math.abs(this.vx);

        if (this.y > CANVAS_HEIGHT + 30) {
          this.y = -40;
          this.x = 60 + Math.random() * (CANVAS_WIDTH - 120);
        }
        break;
      }

      // ★ ゼビウス風：直角クランク移動（横直進→直角折れ曲がり急降下→再び横直進）
      case 'XEVIOUS_TOROID': {
        const cycle = this.timeAlive % 4.0;
        if (cycle < 1.4) {
          this.x += this.vx * dt; // 水平高速直進
        } else if (cycle < 2.0) {
          this.y += 180 * dt; // 直角急降下！
        } else if (cycle < 3.4) {
          this.x -= this.vx * dt; // 逆方向に水平直進！
        } else {
          this.y += 120 * dt;
        }

        if (this.y > CANVAS_HEIGHT + 40) {
          this.y = -30;
          this.x = Math.random() > 0.5 ? -30 : CANVAS_WIDTH + 30;
          this.vx = this.x < 0 ? 140 : -140;
        }
        break;
      }

      // ★ スターフォース風：超高速全画面ダイブ＆大きく旋回
      case 'STARFORCE_SWOOP': {
        this.y += this.vy * dt;
        this.x += Math.sin(this.timeAlive * 3.0) * 240 * dt;

        if (this.y > CANVAS_HEIGHT + 40) {
          this.y = -40;
          this.x = 40 + Math.random() * (CANVAS_WIDTH - 80);
          this.vy = 200 + Math.random() * 60;
        }
        break;
      }
    }

    return justStartedDive;
  }

  // 美しい曲線のパラメトリック座標計算
  private computeCurvePosition(t: number, path: CurvePathType): { x: number; y: number } {
    const cx = CANVAS_WIDTH / 2;

    switch (path) {
      // 1. ギャラガ8の字ループ（リサジューインフィニティ）
      case 'FIGURE_EIGHT': {
        const angle = t * Math.PI * 1.35;
        const x = cx + Math.sin(angle) * 190;
        const y = 220 + Math.sin(angle * 2) * 110;
        return { x: x - this.width / 2, y: y - this.height / 2 };
      }

      // 2. 左から優雅なS字蛇行で画面を渡る
      case 'S_CURVE_LEFT_TO_RIGHT': {
        const progressX = (t / 4.0) * (CANVAS_WIDTH + 140) - 70;
        const y = 80 + Math.sin(t * 3.2) * 130 + t * 45;
        return { x: progressX - this.width / 2, y: y - this.height / 2 };
      }

      // 3. 右から優雅なS字蛇行で画面を渡る
      case 'S_CURVE_RIGHT_TO_LEFT': {
        const progressX = CANVAS_WIDTH + 70 - (t / 4.0) * (CANVAS_WIDTH + 140);
        const y = 80 + Math.cos(t * 3.2) * 130 + t * 45;
        return { x: progressX - this.width / 2, y: y - this.height / 2 };
      }

      // 4. 左からのダイナミック宙返りループ
      case 'INFINITY_DIVE_LEFT': {
        const angle = t * 2.8;
        const x = cx - 90 + Math.cos(angle) * 130;
        const y = 140 + Math.sin(angle) * 130 + t * 65;
        return { x: x - this.width / 2, y: y - this.height / 2 };
      }

      // 5. 右からのダイナミック宙返りループ
      case 'INFINITY_DIVE_RIGHT': {
        const angle = -t * 2.8;
        const x = cx + 90 + Math.cos(angle) * 130;
        const y = 140 + Math.sin(angle) * 130 + t * 65;
        return { x: x - this.width / 2, y: y - this.height / 2 };
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

  public draw(ctx: CanvasRenderingContext2D): void {
    if (this.y < -70 || this.y > CANVAS_HEIGHT + 70) return;

    ctx.save();
    const cx = Math.floor(this.x + this.width / 2);
    const cy = Math.floor(this.y + this.height / 2);

    const isHitFlashing = this.flashTime > 0;

    const f = this.animFrame;
    const isGiant = this.rank === 'GIANT_RED' || this.rank === 'GIANT_YELLOW' || this.rank === 'UFO_MOTHERSHIP';
    let s = isGiant ? 2.8 : 1.4;
    if (this.isBoss) {
      s *= 2.0; // ボスの表示サイズを2倍に！
    }

    ctx.translate(cx, cy);
    ctx.scale(s, s);

    if (isHitFlashing) {
      // 被弾時：四角形ではなく、ボスの機体形状そのものを白色＋発光で点滅させる！
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 12;
    }

    switch (this.rank) {
      case 'GREEN_DRONE': {
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

      // ★ ムーンクレスタ名物：隕石メテオ（不揃いな岩石ピクセル＆回転炎）
      case 'METEOR_ROCK': {
        // 回転しながら飛ぶ岩石
        ctx.rotate(this.timeAlive * 6);
        ctx.fillStyle = '#8b5a2b';
        ctx.fillRect(-9, -9, 18, 18);
        ctx.fillStyle = '#cd853f';
        ctx.fillRect(-7, -7, 14, 14);
        ctx.fillStyle = '#d2691e';
        ctx.fillRect(-4, -4, 8, 8);
        // 大気圏突入の燃える火花
        ctx.fillStyle = f === 0 ? '#ff3300' : '#ffea00';
        ctx.fillRect(-11, -3, 3, 6);
        ctx.fillRect(8, -3, 3, 6);
        ctx.fillRect(-3, -11, 6, 3);
        ctx.fillRect(-3, 8, 6, 3);
        break;
      }

      // ★ ムーンクレスタ名物：撃つと2つに分裂する目玉怪獣
      case 'SPLITTING_EYE': {
        // 生物感のあるドット絵
        ctx.fillStyle = '#ff0055';
        ctx.fillRect(-14, -12, 28, 24);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-10, -8, 20, 16);
        // ギョロリと動く瞳
        const eyeOffsetX = Math.sin(this.timeAlive * 5) * 3;
        ctx.fillStyle = '#00f0ff';
        ctx.fillRect(-5 + eyeOffsetX, -5, 10, 10);
        ctx.fillStyle = '#000033';
        ctx.fillRect(-2 + eyeOffsetX, -2, 4, 4);

        // 触手・トゲ（パタパタ動く）
        ctx.fillStyle = f === 0 ? '#ffcc00' : '#ff3300';
        ctx.fillRect(-18, -4, 4, 8);
        ctx.fillRect(14, -4, 4, 8);
        ctx.fillRect(-8, 12, 4, 5);
        ctx.fillRect(4, 12, 4, 5);
        break;
      }

      // ★ 分裂したミニ目玉
      case 'MINI_EYE': {
        ctx.fillStyle = '#ff0055';
        ctx.fillRect(-8, -7, 16, 14);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-5, -4, 10, 8);
        ctx.fillStyle = '#00f0ff';
        ctx.fillRect(-2, -2, 4, 4);
        ctx.fillStyle = f === 0 ? '#ffcc00' : '#ff3300';
        ctx.fillRect(-10, -2, 2, 4);
        ctx.fillRect(8, -2, 2, 4);
        break;
      }

      // ★ ゼビウス風トーロイド（幾何学的菱形リング）
      case 'TOROID_SCOUT': {
        ctx.rotate(this.timeAlive * 4); // 高速回転リング
        ctx.fillStyle = '#cccccc';
        ctx.fillRect(-10, -10, 20, 20);
        ctx.fillStyle = '#000000';
        ctx.fillRect(-5, -5, 10, 10); // 中央空洞（リング）
        ctx.fillStyle = f === 0 ? '#00f0ff' : '#ffffff';
        ctx.fillRect(-2, -2, 4, 4); // コア発光
        break;
      }
    }

    if (this.isBoss || (isGiant && this.maxHp > 1)) {
      const hpRatio = Math.max(0, this.hp / this.maxHp);
      const barWidth = Math.max(36, this.width * 0.6);
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillRect(-barWidth / 2, -this.height / 2 - 12, barWidth, 5);
      ctx.fillStyle = hpRatio > 0.3 ? '#00ff88' : '#ff0033';
      ctx.fillRect(-barWidth / 2, -this.height / 2 - 12, barWidth * hpRatio, 5);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(-barWidth / 2, -this.height / 2 - 12, barWidth, 5);
    }

    ctx.restore();
  }
}
