import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../config';

export type AlienRank =
  | 'GREEN_DRONE'      // 小型グリーン（ギャラガ）
  | 'RED_GUARD'        // 小型レッド（ギャラガ）
  | 'YELLOW_COMMANDER' // 小型イエロー（ギャラガ）
  | 'GIANT_RED'        // 倍サイズ大型レッド
  | 'GIANT_YELLOW'     // 倍サイズ大型イエロー
  | 'UFO_MOTHERSHIP'   // 超大型ボスUFO
  | 'METEOR_ROCK'      // ★ ムーンクレスタ：メテオ（硬くて回転しながら急降下）
  | 'SPLITTING_EYE'    // ★ ムーンクレスタ：コールドアイ（撃つと2つのスーパーアイに分裂）
  | 'MINI_EYE'         // ★ ムーンクレスタ：スーパーアイ（分裂小型目玉）
  | 'FOUR_FLY'         // ★ ムーンクレスタ：フォー・フライ（十字型エイリアン）
  | 'ATOMIC_PHANTOM'   // ★ ムーンクレスタ：アトミック・ファントム
  | 'BETA_PHANTOM'     // ★ ムーンクレスタ：ベータ・ファントム（コウモリ型翼）
  | 'TOROID_SCOUT'     // ★ 沙羅曼蛇・ゼビウス風トーロイド
  | 'VANGUARD_POD'     // ★ SNKバンガード：特定高度を往復巡航し急降下
  | 'TERRAIN_MISSILE'  // ★ コナミ・スクランブル：地形から横・縦に噴射突進
  | 'FAST_FLYBY'       // ★ 高速横断フライバイ
  | 'GIGA_COLD_EYE'    // ★ 超ド級分裂目玉ボス
  | 'SPACE_SERPENT_HEAD' // ★ 多関節スペースドラゴン（頭部）
  | 'SERPENT_BODY';    // ★ 多関節スペースドラゴン（胴体節）

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
  | 'METEOR_STRAIGHT'     // ★ ムーンクレスタ風：超高速直線メテオ
  | 'ZIGZAG_DIVE'         // ★ ムーンクレスタ風：カミソリ急降下（電光石火の左右切り返し）
  | 'CROSS_SPLIT'         // ★ 左右斜め上から中央交差突入
  | 'MOON_SPLIT_FLOAT'    // ★ ムーンクレスタ風：カクカク不規則に左右に振れながら降下
  | 'MOON_COLD_EYE'       // ★ ムーンクレスタ完全再現：コールドアイ（上部横スイング＆階段状ジグザグ急降下）
  | 'MOON_SUPER_EYE'      // ★ ムーンクレスタ完全再現：スーパーアイ（左右高速ダイアゴナルバウンド）
  | 'XEVIOUS_TOROID'      // ★ ゼビウス風：直角クランク移動で画面をクロス
  | 'STARFORCE_SWOOP'     // ★ スターフォース風：超高速ダイナミック全画面ダイブ＆旋回
  | 'VANGUARD_CRUISE'     // ★ SNKバンガード：画面上部往復から急降下ダイブ
  | 'TERRAIN_LAUNCH'      // ★ スクランブル：壁から横へ加速発射
  | 'FLYBY_CROSS'         // ★ 水平全速フライバイ
  | 'SERPENT_SLITHER';    // ★ スペースドラゴン蛇行運動

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

  // ムーンクレスタ専用状態
  public moonState: 'HOVER' | 'DIVE' = 'HOVER';
  public diveDelay = 0;
  public movingRight = true;
  public eyeLookX = 0;

  // ストリーム曲線編隊パラメータ
  public curveType?: CurvePathType;
  public streamDelay = 0; // 連隊内の順番ディレイ (0.12秒刻み)
  public streamProgress = 0;

  // 多関節ドラゴン用パラメータ
  public trail: { x: number; y: number }[] = [];
  public leader?: Enemy;
  public segmentIndex = 0;

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
        this.height = 40;
        this.maxHp = 1; // 1発で2つのMINI_EYEに分裂
        this.scoreValue = 500;
        break;
      case 'MINI_EYE':
        this.width = 26;
        this.height = 22;
        this.maxHp = 1;
        this.scoreValue = 250;
        break;
      case 'FOUR_FLY':
        this.width = 36;
        this.height = 36;
        this.maxHp = 1;
        this.scoreValue = 300;
        break;
      case 'ATOMIC_PHANTOM':
        this.width = 40;
        this.height = 36;
        this.maxHp = 1;
        this.scoreValue = 400;
        break;
      case 'BETA_PHANTOM':
        this.width = 44;
        this.height = 36;
        this.maxHp = 2; // タフなコウモリ型
        this.scoreValue = 600;
        break;
      case 'TOROID_SCOUT':
        this.width = 32;
        this.height = 32;
        this.maxHp = 1;
        this.scoreValue = 350;
        break;
      case 'VANGUARD_POD':
        this.width = 36;
        this.height = 32;
        this.maxHp = 2; // 耐久2発のタフな巡航ポッド
        this.scoreValue = 450;
        break;
      case 'TERRAIN_MISSILE':
        this.width = 28;
        this.height = 20;
        this.maxHp = 1;
        this.scoreValue = 300;
        break;
      case 'FAST_FLYBY':
        this.width = 34;
        this.height = 24;
        this.maxHp = 1;
        this.scoreValue = 500;
        break;
      case 'GIGA_COLD_EYE':
        this.width = 112;
        this.height = 96;
        this.maxHp = 45; // 超ド級巨大目玉
        this.scoreValue = 8000;
        break;
      case 'SPACE_SERPENT_HEAD':
        this.width = 72;
        this.height = 64;
        this.maxHp = 40; // 多関節ドラゴン頭部
        this.scoreValue = 10000;
        break;
      case 'SERPENT_BODY':
        this.width = 48;
        this.height = 48;
        this.maxHp = 999; // 頭部破壊で連鎖爆散
        this.scoreValue = 1000;
        break;
    }
    if (this.isBoss) {
      // ユーザー要望：ボスの当たり判定を見かけのピクセルサイズに厳密補正（余分な拡大なし）
      if (this.rank === 'GIANT_RED') {
        this.width = 80;
        this.height = 72;
      } else if (this.rank === 'GIANT_YELLOW') {
        this.width = 88;
        this.height = 76;
      } else if (this.rank === 'UFO_MOTHERSHIP') {
        this.width = 130;
        this.height = 80;
      }
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
      this.vx = (Math.random() > 0.5 ? 1 : -1) * 150;
      this.vy = 110; // スピーディなカクカク不規則降下
    } else if (pattern === 'MOON_COLD_EYE') {
      // ★ ムーンクレスタ完全再現：コールドアイ
      // 4機が初期フレームから上部に並んで配置（spawnDelay=0 なら即座に画面内 y=90 に出現）
      const colIndex = Math.floor(formationCol) % 4;
      const xPositions = [85, 195, 305, 415];
      this.formationX = xPositions[colIndex];
      this.formationY = 90 + formationRow * 44;
      this.x = this.formationX;
      this.y = spawnDelay === 0 ? this.formationY : -50;
      this.moonState = 'HOVER';
      this.movingRight = colIndex % 2 === 0;
      this.diveDelay = 1.8 + colIndex * 2.4;
      this.vx = (this.movingRight ? 1 : -1) * 190;
      this.vy = 24;
    } else if (pattern === 'MOON_SUPER_EYE') {
      // ★ ムーンクレスタ完全再現：スーパーアイ
      const colIndex = Math.floor(formationCol) % 8;
      this.formationX = 40 + colIndex * 65;
      this.formationY = 80 + formationRow * 36;
      this.x = this.formationX;
      this.y = spawnDelay === 0 ? this.formationY : -40;
      this.movingRight = Math.random() > 0.5;
      this.vx = (this.movingRight ? 1 : -1) * 220;
      this.vy = 90;
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
    } else if (pattern === 'METEOR_STRAIGHT') {
      this.x = 40 + Math.random() * (CANVAS_WIDTH - 80);
      this.y = -50;
      this.vx = (Math.random() - 0.5) * 120;
      this.vy = 260 + Math.random() * 80; // 高速直線落下
    } else if (pattern === 'FLYBY_CROSS') {
      const fromLeft = formationCol % 2 === 0;
      this.x = fromLeft ? -50 : CANVAS_WIDTH + 50;
      this.y = 80 + Math.random() * (CANVAS_HEIGHT * 0.45);
      this.vx = fromLeft ? 380 : -380;
      this.vy = (Math.random() - 0.5) * 60;
    } else if (pattern === 'VANGUARD_CRUISE') {
      this.x = Math.random() * (CANVAS_WIDTH - this.width);
      this.y = 70 + (formationRow % 3) * 40;
      this.moonState = 'HOVER';
      this.movingRight = Math.random() > 0.5;
      this.vx = (this.movingRight ? 1 : -1) * 160;
      this.vy = 0;
    } else if (pattern === 'TERRAIN_LAUNCH') {
      this.x = Math.random() > 0.5 ? -40 : CANVAS_WIDTH + 40;
      this.y = 100 + Math.random() * (CANVAS_HEIGHT * 0.5);
      this.vx = this.x < 0 ? 200 : -200;
      this.vy = (Math.random() - 0.5) * 80;
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
      } else if (this.pattern === 'METEOR_STRAIGHT') {
        this.x = this.formationX;
        this.y = -60;
      } else if (this.pattern === 'FLYBY_CROSS') {
        this.x = this.vx > 0 ? -60 : CANVAS_WIDTH + 60;
        this.y = this.formationY;
      } else if (this.pattern === 'ZIGZAG_DIVE') {
        this.x = this.formationX;
        this.y = -50;
      } else if (this.pattern === 'CROSS_SPLIT') {
        this.x = this.formationX < CANVAS_WIDTH / 2 ? -40 : CANVAS_WIDTH + 40;
        this.y = -40;
      } else if (this.pattern === 'MOON_COLD_EYE') {
        this.x = this.formationX;
        this.y = -50;
      } else if (this.pattern === 'MOON_SUPER_EYE') {
        this.x = this.formationX;
        this.y = -40;
      } else if (this.pattern === 'VANGUARD_CRUISE') {
        this.x = this.formationX;
        this.y = -50;
      } else if (this.pattern === 'TERRAIN_LAUNCH') {
        this.x = this.vx > 0 ? -50 : CANVAS_WIDTH + 50;
        this.y = this.formationY;
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

      // ★ ムーンクレスタ風：フォー・フライ等のカクカク不規則移動＆積極的急降下スウィング！
      case 'MOON_SPLIT_FLOAT': {
        this.y += this.vy * dt;
        // 鋭くリズミカルなステップ移動（スピードを160px/sにアップ）
        const stepPeriod = Math.floor(this.timeAlive * 4.5);
        const dir = (stepPeriod % 2 === 0) ? 1 : -1;
        this.x += dir * Math.abs(this.vx) * dt;

        if (this.x < 30) this.vx = Math.abs(this.vx);
        if (this.x > CANVAS_WIDTH - 30 - this.width) this.vx = -Math.abs(this.vx);

        // 周期的にプレイヤーに向かってスウィープ加速！
        if (Math.sin(this.timeAlive * 2.5) > 0.8) {
          this.vy = 160;
        } else {
          this.vy = 110;
        }

        if (this.y > CANVAS_HEIGHT + 30) {
          this.y = -40;
          this.x = 60 + Math.random() * (CANVAS_WIDTH - 120);
        }
        break;
      }

      // ★ ムーンクレスタ完全再現：コールドアイ
      // 上部で4機が息を合わせて横スイング → 順次離脱して画面端でガクンと降りる階段状急降下
      case 'MOON_COLD_EYE': {
        if (this.moonState === 'HOVER') {
          // 増援の場合、上部待機位置から編隊Y座標までスムーズに滑空
          if (this.y < this.formationY) {
            this.y += 130 * dt;
            if (this.y > this.formationY) this.y = this.formationY;
          }
          // 上部で4機が呼吸を合わせて左右にゆったりスイング（ムーンクレスタ完全再現！）
          const sway = Math.sin(this.timeAlive * 2.2) * 55;
          this.x = this.formationX + sway;
          this.eyeLookX = Math.cos(this.timeAlive * 2.2);

          // 一定時間経過で順次急降下ダイブ開始！
          if (this.patternTimer >= this.diveDelay) {
            this.moonState = 'DIVE';
            this.movingRight = this.eyeLookX >= 0;
            this.vx = (this.movingRight ? 1 : -1) * 190;
            justStartedDive = true;
          }
        } else {
          // 【急降下モード：ムーンクレスタ名物・階段状カクカクジグザグ急降下！】
          this.x += this.vx * dt;
          this.y += 24 * dt; // 緩やかな下降
          this.eyeLookX = this.movingRight ? 1 : -1;

          // 画面左右端に達したら一段「ガクン」と急降下して方向転換（階段移動）
          const leftLimit = 20;
          const rightLimit = CANVAS_WIDTH - 20 - this.width;

          if (this.x <= leftLimit && !this.movingRight) {
            this.x = leftLimit;
            this.movingRight = true;
            this.vx = 190;
            this.y += 36; // ガクンと階段を降りるように下降！
          } else if (this.x >= rightLimit && this.movingRight) {
            this.x = rightLimit;
            this.movingRight = false;
            this.vx = -190;
            this.y += 36; // ガクンと階段を降りるように下降！
          }

          // 画面下端を抜けたら天頂から再突入（ムーンクレスタのループ仕様！）
          if (this.y > CANVAS_HEIGHT + 30) {
            this.y = -35;
            this.x = Math.max(30, Math.min(CANVAS_WIDTH - 30 - this.width, this.x));
            this.movingRight = !this.movingRight;
            this.vx = (this.movingRight ? 1 : -1) * 190;
          }
        }
        break;
      }

      // ★ ムーンクレスタ完全再現：スーパーアイ
      // 分裂直後から全画面を電光石火の左右ダイアゴナルバウンド＆高速ジグザグ！
      case 'MOON_SUPER_EYE': {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.eyeLookX = this.vx > 0 ? 1 : -1;

        const leftLimit = 16;
        const rightLimit = CANVAS_WIDTH - 16 - this.width;

        if (this.x <= leftLimit && this.vx < 0) {
          this.x = leftLimit;
          this.vx = 220;
          this.y += 24; // 壁バウンドで一段落下
        } else if (this.x >= rightLimit && this.vx > 0) {
          this.x = rightLimit;
          this.vx = -220;
          this.y += 24;
        }

        // 画面下端を抜けたら上から再突入
        if (this.y > CANVAS_HEIGHT + 25) {
          this.y = -25;
          this.x = 30 + Math.random() * (CANVAS_WIDTH - 60 - this.width);
          this.vx = (Math.random() > 0.5 ? 1 : -1) * 220;
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

      // ★ SNKバンガード風ポッド：画面上部（特定高度）を左右巡航し、突如急降下ダイブ！
      case 'VANGUARD_CRUISE': {
        if (this.moonState === 'HOVER') {
          this.x += (this.movingRight ? 160 : -160) * dt;
          if (this.x < 30) {
            this.x = 30;
            this.movingRight = true;
          } else if (this.x > CANVAS_WIDTH - 30 - this.width) {
            this.x = CANVAS_WIDTH - 30 - this.width;
            this.movingRight = false;
          }

          // 2.5秒後、または自機が直下に近づいた際にダイブ移行
          if (this.patternTimer > 2.2 && canDive) {
            this.moonState = 'DIVE';
            this.diveTargetX = playerX;
            this.diveTargetY = playerY;
            const diffX = this.diveTargetX - this.x;
            const diffY = this.diveTargetY - this.y;
            const dist = Math.hypot(diffX, diffY) || 1;
            this.vx = (diffX / dist) * 280;
            this.vy = Math.max(160, (diffY / dist) * 280);
            justStartedDive = true;
          }
        } else {
          // 急降下ダイブ中
          this.x += this.vx * dt;
          this.y += this.vy * dt;
          if (this.y > CANVAS_HEIGHT + 30) {
            this.y = 80 + Math.random() * 100;
            this.x = Math.random() * (CANVAS_WIDTH - this.width);
            this.moonState = 'HOVER';
            this.patternTimer = 0;
          }
        }
        break;
      }

      // ★ コナミ・スクランブル風ミサイル：壁や端から横・斜めへ推進加速！
      case 'TERRAIN_LAUNCH': {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        // 徐々に速度アップ
        this.vx *= 1.015;
        this.vy *= 1.01;

        if (this.x < -60 || this.x > CANVAS_WIDTH + 60 || this.y > CANVAS_HEIGHT + 60 || this.y < -60) {
          this.isDead = true;
        }
        break;
      }

      // ★ 超高速直進メテオ：斜め上から一直線に火花を散らして切り裂く
      case 'METEOR_STRAIGHT': {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        if (this.y > CANVAS_HEIGHT + 50 || this.x < -50 || this.x > CANVAS_WIDTH + 50) {
          this.isDead = true;
        }
        break;
      }

      // ★ 超高速フライバイ：画面横外から一瞬で全画面を突き抜ける
      case 'FLYBY_CROSS': {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        if (this.x < -80 || this.x > CANVAS_WIDTH + 80) {
          this.isDead = true;
        }
        break;
      }

      // ★ スペースドラゴン蛇行運動（頭部がサイン波で画面を這い回り、胴体セグメントが追従）
      case 'SERPENT_SLITHER': {
        if (this.rank === 'SPACE_SERPENT_HEAD') {
          this.patternTimer += dt;
          this.x = CANVAS_WIDTH / 2 + Math.sin(this.patternTimer * 1.8) * 190 - this.width / 2;
          this.y = 130 + Math.cos(this.patternTimer * 0.9) * 75 + Math.sin(this.patternTimer * 2.7) * 45;

          // 胴体追従用の軌跡履歴を更新
          this.trail.unshift({ x: this.x + (this.width - 48) / 2, y: this.y + (this.height - 48) / 2 });
          if (this.trail.length > 120) {
            this.trail.pop();
          }
        } else if (this.rank === 'SERPENT_BODY' && this.leader) {
          // リーダー頭部の過去座標インデックスを取り出して追従
          const delayIndex = this.segmentIndex * 8;
          if (this.leader.trail.length > delayIndex) {
            const pos = this.leader.trail[delayIndex];
            this.x = pos.x;
            this.y = pos.y;
          }
          if (this.leader.isDead) {
            this.isDead = true;
          }
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

    const hpRatio = this.hp / this.maxHp;
    const isLowHp = (this.isBoss || isGiant || this.rank === 'GIGA_COLD_EYE' || this.rank === 'SPACE_SERPENT_HEAD') && this.maxHp > 3 && hpRatio <= 0.5;
    const isCriticalHp = isLowHp && hpRatio <= 0.25;

    if (isHitFlashing) {
      // 被弾時：白色＋強い発光
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 14;
    } else if (isCriticalHp) {
      // ユーザー要望：死にそうになったら赤・黄色点滅（危険状態ストロボ）
      const strobeColor = Math.floor(this.timeAlive * 16) % 2 === 0 ? '#ff0033' : '#ffff00';
      ctx.shadowColor = strobeColor;
      ctx.shadowBlur = 18;
    } else if (isLowHp) {
      // HP 50%以下：黄色点滅
      const strobeColor = Math.floor(this.timeAlive * 8) % 2 === 0 ? '#ffea00' : '#ff7700';
      ctx.shadowColor = strobeColor;
      ctx.shadowBlur = 10;
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

      // ★ ムーンクレスタ完全再現：コールドアイ（撃つと2つに分裂する怪獣目玉）
      case 'SPLITTING_EYE': {
        // 1. 赤いヘルメット状外郭
        ctx.fillStyle = '#d8002b';
        ctx.fillRect(-15, -14, 30, 8);
        ctx.fillRect(-16, -6, 32, 14);

        // 2. 頭頂部の王冠風黄色突起（ムーンクレスタのトレードマーク）
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(-11, -17, 5, 4);
        ctx.fillRect(-2, -18, 5, 5);
        ctx.fillRect(7, -17, 5, 4);

        // 3. 左右のパタパタ動く側翼
        ctx.fillStyle = f === 0 ? '#ffea00' : '#ff0044';
        if (f === 0) {
          ctx.fillRect(-19, -4, 4, 10);
          ctx.fillRect(15, -4, 4, 10);
        } else {
          ctx.fillRect(-18, -7, 3, 10);
          ctx.fillRect(15, -7, 3, 10);
        }

        // 4. 巨大な白目
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-10, -7, 20, 14);

        // 5. 水色虹彩＋黒瞳孔＋白ハイライト（移動方向やプレイヤーをギョロリと見つめる！）
        const eyeShift = Math.max(-4, Math.min(4, Math.round(this.eyeLookX * 4)));
        ctx.fillStyle = '#00f0ff';
        ctx.fillRect(-4 + eyeShift, -5, 8, 10);
        ctx.fillStyle = '#000033';
        ctx.fillRect(-2 + eyeShift, -3, 4, 6);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-1 + eyeShift, -4, 2, 2);

        // 6. 下部の黄色い鋭いアゴ・牙（アニメーションで開閉）
        ctx.fillStyle = '#ffea00';
        if (f === 0) {
          ctx.fillRect(-12, 8, 4, 6);
          ctx.fillRect(-4, 8, 3, 4);
          ctx.fillRect(1, 8, 3, 4);
          ctx.fillRect(8, 8, 4, 6);
        } else {
          ctx.fillRect(-10, 8, 5, 5);
          ctx.fillRect(-3, 8, 6, 5);
          ctx.fillRect(5, 8, 5, 5);
        }
        break;
      }

      // ★ ムーンクレスタ完全再現：スーパーアイ（分裂した小型目玉）
      case 'MINI_EYE': {
        // 1. 赤い小型ボディ
        ctx.fillStyle = '#d8002b';
        ctx.fillRect(-10, -8, 20, 14);

        // 2. 左右の黄色い小さな翼
        ctx.fillStyle = '#ffea00';
        if (f === 0) {
          ctx.fillRect(-13, -3, 4, 6);
          ctx.fillRect(9, -3, 4, 6);
        } else {
          ctx.fillRect(-12, -5, 3, 6);
          ctx.fillRect(9, -5, 3, 6);
        }

        // 3. 白目
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-6, -5, 12, 9);

        // 4. 水色と黒の瞳（高速移動に追従）
        const miniShift = Math.max(-2, Math.min(2, Math.round(this.eyeLookX * 2)));
        ctx.fillStyle = '#00f0ff';
        ctx.fillRect(-3 + miniShift, -4, 6, 7);
        ctx.fillStyle = '#000033';
        ctx.fillRect(-1 + miniShift, -2, 3, 4);

        // 5. 下部の小さな足
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(-7, 6, 3, 3);
        ctx.fillRect(4, 6, 3, 3);
        break;
      }

      // ★ ムーンクレスタ：フォー・フライ（十字型・4枚羽エイリアン）
      case 'FOUR_FLY': {
        ctx.fillStyle = f === 0 ? '#ffea00' : '#ff0033';
        // 中央コア
        ctx.fillRect(-6, -6, 12, 12);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-3, -3, 6, 6);
        ctx.fillStyle = '#0055ff';
        ctx.fillRect(-1, -1, 2, 2);

        // 4枚の羽（羽ばたきアニメ）
        ctx.fillStyle = f === 0 ? '#00ee44' : '#ffea00';
        if (f === 0) {
          ctx.fillRect(-14, -4, 8, 8); // 左
          ctx.fillRect(6, -4, 8, 8);  // 右
          ctx.fillRect(-4, -14, 8, 8); // 上
          ctx.fillRect(-4, 6, 8, 8);  // 下
        } else {
          ctx.fillRect(-12, -12, 7, 7); // 左上
          ctx.fillRect(5, -12, 7, 7);  // 右上
          ctx.fillRect(-12, 5, 7, 7);  // 左下
          ctx.fillRect(5, 5, 7, 7);   // 右下
        }
        break;
      }

      // ★ ムーンクレスタ：アトミック・ファントム（鋭角突撃怪獣）
      case 'ATOMIC_PHANTOM': {
        ctx.fillStyle = '#ff0044';
        ctx.fillRect(-12, -8, 24, 16);
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(-8, -12, 16, 6); // 角
        ctx.fillRect(-8, 8, 16, 4);   // 尾翼

        // 複眼
        ctx.fillStyle = '#00f0ff';
        ctx.fillRect(-7, -4, 5, 6);
        ctx.fillRect(2, -4, 5, 6);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-5, -2, 2, 3);
        ctx.fillRect(4, -2, 2, 3);

        // 左右の牙
        ctx.fillStyle = f === 0 ? '#ffffff' : '#ffcc00';
        ctx.fillRect(-15, 0, 4, 7);
        ctx.fillRect(11, 0, 4, 7);
        break;
      }

      // ★ ムーンクレスタ：ベータ・ファントム（コウモリ・大型翼エイリアン）
      case 'BETA_PHANTOM': {
        // コウモリのような大翼
        ctx.fillStyle = '#ff3300';
        ctx.fillRect(-16, -6, 32, 10);
        ctx.fillStyle = '#ffea00';
        if (f === 0) {
          ctx.fillRect(-20, -10, 8, 14);
          ctx.fillRect(12, -10, 8, 14);
        } else {
          ctx.fillRect(-20, -4, 8, 14);
          ctx.fillRect(12, -4, 8, 14);
        }

        // 胴体と頭部
        ctx.fillStyle = '#0055ff';
        ctx.fillRect(-7, -10, 14, 20);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-4, -6, 8, 6);
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(-2, -4, 4, 3); // 凶悪な赤目
        break;
      }

      // ★ 沙羅曼蛇・ゼビウス風トーロイド（幾何学的菱形リング）
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
      // ★ SNKバンガード風：往復巡航ポッド（VANGUARD_POD）
      case 'VANGUARD_POD': {
        ctx.fillStyle = '#00e5ff';
        ctx.fillRect(-12, -8, 24, 16);
        ctx.fillStyle = '#ffaa00';
        ctx.fillRect(-14, -4, 4, 8);
        ctx.fillRect(10, -4, 4, 8);
        ctx.fillStyle = f === 0 ? '#ff0055' : '#ffffff';
        ctx.fillRect(-4, -4, 8, 8);
        break;
      }

      // ★ コナミ・スクランブル風：地表ミサイル（TERRAIN_MISSILE）
      case 'TERRAIN_MISSILE': {
        // 水平または斜めに噴射しながら飛ぶ弾頭
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-10, -5, 20, 10);
        ctx.fillStyle = '#ff0033';
        ctx.fillRect(6, -6, 5, 12); // 先端ノーズ
        // 後部ロケット噴射炎
        ctx.fillStyle = f === 0 ? '#ffaa00' : '#ffea00';
        ctx.fillRect(-15, -3, 5, 6);
        break;
      }

      // ★ 高速フライバイ横切り機（FAST_FLYBY）
      case 'FAST_FLYBY': {
        ctx.fillStyle = '#ff3366';
        ctx.fillRect(-12, -4, 24, 8);
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(-6, -7, 12, 14);
        ctx.fillStyle = f === 0 ? '#ffff00' : '#ffffff';
        ctx.fillRect(-2, -2, 4, 4);
        break;
      }

      // ★ 超ド級ボス：ギガ・コールドアイ（GIGA_COLD_EYE）
      case 'GIGA_COLD_EYE': {
        // 巨大な赤い頭冠・装甲シェル
        ctx.fillStyle = '#cc0022';
        ctx.fillRect(-24, -20, 48, 14);
        ctx.fillRect(-26, -6, 52, 22);

        // 頭頂の三連ゴールドスパイク
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(-18, -26, 8, 7);
        ctx.fillRect(-4, -28, 8, 9);
        ctx.fillRect(10, -26, 8, 7);

        // 左右の側翼
        ctx.fillStyle = f === 0 ? '#ffaa00' : '#ff0044';
        ctx.fillRect(-30, -8, 6, 16);
        ctx.fillRect(24, -8, 6, 16);

        // 超巨大な白目
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-18, -10, 36, 20);

        // 瞳孔（見つめる巨大目玉）
        const eyeShift = Math.max(-6, Math.min(6, Math.round(this.eyeLookX * 6)));
        ctx.fillStyle = '#00e5ff';
        ctx.fillRect(-8 + eyeShift, -8, 16, 16);
        ctx.fillStyle = '#000033';
        ctx.fillRect(-4 + eyeShift, -5, 8, 10);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-2 + eyeShift, -6, 4, 4);

        // 巨大な牙
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(-20, 16, 8, 8);
        ctx.fillRect(-5, 16, 10, 8);
        ctx.fillRect(12, 16, 8, 8);
        break;
      }

      // ★ 多関節ボス：スペースサーペント頭部（SPACE_SERPENT_HEAD）
      case 'SPACE_SERPENT_HEAD': {
        // ドラゴン風ヘッド
        ctx.fillStyle = '#00cc66';
        ctx.fillRect(-18, -14, 36, 28);
        ctx.fillStyle = '#00ff88';
        ctx.fillRect(-12, -10, 24, 20);
        // 角
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(-16, -20, 6, 8);
        ctx.fillRect(10, -20, 6, 8);
        // 燃える赤い眼
        ctx.fillStyle = f === 0 ? '#ff0033' : '#ff5500';
        ctx.fillRect(-10, -6, 6, 6);
        ctx.fillRect(4, -6, 6, 6);
        // 牙
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-12, 12, 4, 6);
        ctx.fillRect(-2, 12, 4, 5);
        ctx.fillRect(8, 12, 4, 6);
        break;
      }

      // ★ 多関節ボス：スペースサーペント胴体（SERPENT_BODY）
      case 'SERPENT_BODY': {
        const segHue = (this.segmentIndex * 24) % 360;
        ctx.fillStyle = `hsl(${segHue}, 85%, 45%)`;
        ctx.fillRect(-12, -12, 24, 24);
        ctx.fillStyle = `hsl(${segHue}, 90%, 65%)`;
        ctx.fillRect(-7, -7, 14, 14);
        ctx.fillStyle = f === 0 ? '#ffff00' : '#ffffff';
        ctx.fillRect(-3, -3, 6, 6);
        break;
      }
    }

    // ユーザー要望：ボスのHPゲージは完全に撤廃（死にそうになったら赤・黄色点滅ストロボで表現）
    ctx.restore();
  }
}
