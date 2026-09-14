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
  | 'STARFORCE_GARI'   // ★ スターフォース名物：ガリ（急停止・高速旋回・電光石火の急襲）
  | 'GRADIUS_FAN'      // ★ グラディウス／沙羅曼蛇：開幕編隊（突進・反転離脱）
  | 'DART_MISSILE'     // ★ 索敵加速ミサイル（水平浮遊後、縦・横へ急加速）
  | 'SIDE_WARP_RUNNER' // ★ ユーザー要望：左右ループ走査機（画面端から反対側へワープして周回突撃）
  | 'STARFORCE_CORNER' // ★ スターフォース名物：左右端を真下へ落下後、自機Y座標で90度曲がって突撃
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
  | 'METEOR_DIAGONAL'     // ★ 斜め高速メテオ（画面を鋭く切り裂く）
  | 'ZIGZAG_DIVE'         // ★ ムーンクレスタ風：カミソリ急降下（電光石火の左右切り返し）
  | 'CROSS_SPLIT'         // ★ 左右斜め上から中央交差突入
  | 'MOON_SPLIT_FLOAT'    // ★ ムーンクレスタ風：カクカク不規則に左右に振れながら降下
  | 'MOON_COLD_EYE'       // ★ ムーンクレスタ完全再現：コールドアイ（上部横スイング＆階段状ジグザグ急降下）
  | 'MOON_SUPER_EYE'      // ★ ムーンクレスタ完全再現：スーパーアイ（左右高速ダイアゴナルバウンド）
  | 'XEVIOUS_TOROID'      // ★ ゼビウス風：直角クランク移動で画面をクロス
  | 'STARFORCE_SWOOP'     // ★ スターフォース風：超高速ダイナミック全画面ダイブ＆旋回
  | 'STARFORCE_GARI_MOVE' // ★ スターフォース・ガリの動き（急降下→急停止→鋭角急加速）
  | 'STARFORCE_CORNER_DIVE' // ★ スターフォース：端を落下→自機Yで90度曲がって突撃
  | 'GRADIUS_FLEET'       // ★ グラディウス開幕編隊（突撃後、急旋回して斜め離脱）
  | 'DELAYED_DART'        // ★ 索敵加速ミサイル（微動後、一気に高速直進）
  | 'SIDE_WRAP_SWEEP'     // ★ ユーザー要望：左右ループ周回（右端に行くと左から、左端に行くと右から連続突撃）
  | 'VANGUARD_CRUISE'     // ★ SNKバンガード：画面上部往復から急降下ダイブ
  | 'TERRAIN_LAUNCH'      // ★ スクランブル：壁から横へ加速発射
  | 'FLYBY_CROSS'         // ★ 水平全速フライバイ
  | 'SERPENT_SLITHER'     // ★ スペースドラゴン蛇行運動
  | 'ATOMIC_CHARGE'       // ★ 7面：アトミック・ファントム。上部で静止→予兆の震え→自機へ鋭角急加速突撃
  | 'BETA_WING_SWEEP';    // ★ 7面：ベータ・ファントム。翼を広げて横スイープ→自機の真上で翼を畳んで垂直ダイブ

export class Enemy {
  public id: string;
  public x: number;
  public y: number;
  public vx = 0;
  public vy = 0;
  // ★ 地表ミサイルの予備動作：壁際で上下に揺れてから突っ込む（残り秒数）
  public prelaunchTimer = 0;
  public prelaunchBaseY = 0;
  // ★ 7面用ステート
  private chargeState: 'DESCEND' | 'HOVER' | 'CHARGE' | 'EXIT' = 'DESCEND';
  private chargeTimer = 0;
  private chargeSpeed = 0;
  private chargeDirX = 0;
  private chargeDirY = 1;
  private betaState: 'SWEEP' | 'DIVE' = 'SWEEP';
  private betaTurns = 0;
  private terrainArmed = false; // TERRAIN_LAUNCH：初回起動時に予備動作をセット済みか
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

  // スターフォース90度直角旋回・メテオレーザー通知用
  public turned90 = false;
  public justFiredLaser = false;

  // ストリーム曲線編隊パラメータ
  public curveType?: CurvePathType;
  public streamDelay = 0; // 連隊内の順番ディレイ (0.12秒刻み)
  public streamProgress = 0;

  // 多関節ドラゴン用パラメータ
  public trail: { x: number; y: number }[] = [];
  public leader?: Enemy;
  public segmentIndex = 0;
  // ボス専用ダイナミックAIパラメータ（左右大旋回・深部急降下後退・画面突き抜けループ・ホバリング）
  public bossPhase: 'HOVER_BARRAGE' | 'WIDE_SWEEP' | 'DEEP_DIVE_RETREAT' | 'DIVE_THROUGH' = 'HOVER_BARRAGE';
  public bossPhaseTimer = 0;
  public bossDiveVariant = 0;

  private animFrame = 0;
  private animTimer = 0;
  private timeAlive = 0;
  private patternTimer = 0;
  private flashTime = 0;
  public spawnAnimationTimer = 0; // 点から拡大して出現するアニメーションタイマー

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
        this.width = 40;
        this.height = 36;
        this.maxHp = 1;
        this.scoreValue = 100;
        break;
      case 'RED_GUARD':
        this.width = 44;
        this.height = 40;
        this.maxHp = 1;
        this.scoreValue = 200;
        break;
      case 'YELLOW_COMMANDER':
        this.width = 50;
        this.height = 44;
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
        this.maxHp = 1; // ユーザー要望：ザコは基本一撃で死ぬように
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
        this.maxHp = 1; // ユーザー要望：ザコは基本一撃で死ぬように
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
        this.maxHp = 1; // ユーザー要望：ザコは基本一撃で死ぬように
        this.scoreValue = 450;
        break;
      case 'TERRAIN_MISSILE':
        this.width = 80; // ユーザー要望：横から飛んでくるミサイル、倍サイズで
        this.height = 36;
        this.maxHp = 1;
        this.scoreValue = 300;
        break;
      case 'FAST_FLYBY':
        this.width = 34;
        this.height = 24;
        this.maxHp = 1;
        this.scoreValue = 500;
        break;
      case 'STARFORCE_GARI':
        this.width = 34;
        this.height = 30;
        this.maxHp = 1;
        this.scoreValue = 600; // スターフォースの難敵ガリ
        break;
      case 'GRADIUS_FAN':
        this.width = 32;
        this.height = 28;
        this.maxHp = 1;
        this.scoreValue = 400; // グラディウス開幕ファン編隊
        break;
      case 'DART_MISSILE':
        this.width = 48; // ユーザー要望：横から飛んでくるミサイル、倍サイズで
        this.height = 44;
        this.maxHp = 1;
        this.scoreValue = 350; // 索敵急加速ミサイル
        break;
      case 'SIDE_WARP_RUNNER':
        this.width = 36;
        this.height = 26;
        this.maxHp = 1;
        this.scoreValue = 500; // 左右ループ走査機
        break;
      case 'STARFORCE_CORNER':
        this.width = 28;
        this.height = 28;
        this.maxHp = 1;
        this.scoreValue = 450; // スターフォース90度直角旋回機
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
    } else if (pattern === 'METEOR_STRAIGHT') {
      // ★ ユーザー要望：超高速で突っ込んでくるメテオ！火花を散らして一直線急降下
      this.x = Math.max(30, Math.min(CANVAS_WIDTH - 30 - this.width, this.formationX));
      this.y = -60;
      this.vx = (Math.random() - 0.5) * 100;
      this.vy = 420 + Math.random() * 80; // 420〜500px/s の超高速ダイブ！
    } else if (pattern === 'ZIGZAG_DIVE') {
      this.x = this.formationX;
      this.y = -50;
      this.vx = 180;
      this.vy = 120;
    } else if (pattern === 'ATOMIC_CHARGE') {
      this.x = this.formationX;
      this.y = -50;
      this.vy = 220;
      this.chargeState = 'DESCEND';
    } else if (pattern === 'BETA_WING_SWEEP') {
      // 左右どちらかの画面外から、上部〜中段の高さで進入
      const fromLeft = formationCol % 2 === 0;
      this.x = fromLeft ? -60 : CANVAS_WIDTH + 60;
      this.y = 90 + (formationRow % 4) * 55;
      this.vx = (fromLeft ? 1 : -1) * 170;
      this.betaState = 'SWEEP';
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
      this.vy = 65; // ムーンクレスタ本来のリズミカルな階段降下速度
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
    } else if (pattern === 'FLYBY_CROSS') {
      const fromLeft = formationCol % 2 === 0;
      this.x = fromLeft ? -50 : CANVAS_WIDTH + 50;
      this.y = 80 + Math.random() * (CANVAS_HEIGHT * 0.45);
      this.vx = fromLeft ? 380 : -380;
      this.vy = (Math.random() - 0.5) * 60;
    } else if (pattern === 'VANGUARD_CRUISE') {
      // ★ ユーザー要望：画面内直接出現を避け、画面上端の外から降りてくる
      this.x = Math.random() * (CANVAS_WIDTH - this.width);
      this.y = -50;
      this.moonState = 'HOVER';
      this.movingRight = Math.random() > 0.5;
      this.vx = (this.movingRight ? 1 : -1) * 160;
      this.vy = 0;
    } else if (pattern === 'METEOR_DIAGONAL') {
      // ★ 斜め高速メテオ：左右上空から対角線へ火花を散らして急降下
      const fromLeft = Math.random() > 0.5;
      this.x = fromLeft ? -30 : CANVAS_WIDTH + 30;
      this.y = -30 + Math.random() * 80;
      this.vx = (fromLeft ? 1 : -1) * (260 + Math.random() * 100);
      this.vy = 320 + Math.random() * 80;
    } else if (pattern === 'STARFORCE_GARI_MOVE') {
      // ★ スターフォース・ガリ：画面上部から高速降下
      this.x = Math.max(40, Math.min(CANVAS_WIDTH - 40 - this.width, this.formationX));
      this.y = -40;
      this.vx = 0;
      this.vy = 280; // 初速降下
    } else if (pattern === 'GRADIUS_FLEET') {
      // ★ グラディウス開幕突進編隊：上空からまっすぐ急降下
      const colX = 70 + (formationCol % 6) * 65;
      this.x = colX;
      this.y = -40;
      this.vx = 0;
      this.vy = 260; // まっすぐ突撃
    } else if (pattern === 'DELAYED_DART') {
      // ★ 索敵急加速ミサイル：横にフワッと浮遊
      // ★ ユーザー要望：開幕に画面内へ直接出現して自機と重ならないよう、画面外の左右端からスタート
      const fromLeft = formationCol % 2 === 0;
      this.x = fromLeft ? -this.width - 10 : CANVAS_WIDTH + 10;
      this.y = 80 + Math.random() * 120;
      this.vx = (fromLeft ? 1 : -1) * 75; // 最初の索敵慣性移動
      this.vy = 25;
    } else if (pattern === 'SIDE_WRAP_SWEEP') {
      // ★ 左右ループ走査機：端から端へ高速横断、逆側から再突入
      const fromLeft = formationCol % 2 === 0;
      this.x = fromLeft ? -40 : CANVAS_WIDTH + 40;
      this.y = 90 + (formationRow % 5) * 48;
      this.vx = (fromLeft ? 1 : -1) * (240 + Math.random() * 60);
      this.vy = 28; // 緩やかに降りながら左右を高速ループ！
    } else if (pattern === 'STARFORCE_CORNER_DIVE') {
      // ★ スターフォース名物：左右端を落下し自機Yで90度曲がって突進
      const startLeft = formationCol % 2 === 0;
      this.x = startLeft ? 28 : CANVAS_WIDTH - 28 - this.width;
      this.y = -40;
      this.vx = 0;
      this.vy = 280;
      this.turned90 = false;
    } else if (pattern === 'TERRAIN_LAUNCH') {
      this.x = Math.random() > 0.5 ? -40 : CANVAS_WIDTH + 40;
      this.y = 100 + Math.random() * (CANVAS_HEIGHT * 0.5);
      // ユーザー要望：速度は半分に（200px/s → 100px/s）
      this.vx = this.x < 0 ? 100 : -100;
      this.vy = (Math.random() - 0.5) * 40;
    } else {
      this.x = -100;
      this.y = -100;
    }
  }

  // ★ 出現をさらに遅らせる（開幕セーフティ時間用。patternTimer < 0 の間は待機して画面外に留まる）
  public delaySpawn(seconds: number): void {
    this.patternTimer -= seconds;
  }

  // 出現までの残り秒数（未出現なら正、出現済みなら0）
  public getSpawnDelay(): number {
    return Math.max(0, -this.patternTimer);
  }

  public update(
    dt: number,
    formationOffsetAngle: number,
    playerX: number,
    playerY: number,
    canDive: boolean
  ): boolean {
    let justStartedDive = false;
    const prevPatternTimer = this.patternTimer;
    this.timeAlive += dt;
    this.patternTimer += dt;
    if (this.flashTime > 0) this.flashTime -= dt;

    // ★ ユーザー要望：ムーンクレスタ1面風の登場演出
    // 「何もないところから点が生まれてそれが拡大して敵になるようなムーンクレスタ一面のような登場」
    // patternTimerが0以上になった最初の0.6秒間で点が拡大して実体化する
    if (this.patternTimer >= 0 && this.spawnAnimationTimer < 0.6) {
      this.spawnAnimationTimer += dt;
    }

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
      } else if (this.pattern === 'ATOMIC_CHARGE') {
        this.x = this.formationX;
        this.y = -50;
      } else if (this.pattern === 'BETA_WING_SWEEP') {
        this.x = this.vx >= 0 ? -60 : CANVAS_WIDTH + 60;
      } else if (this.pattern === 'VANGUARD_CRUISE') {
        this.x = this.formationX;
        this.y = -50;
      } else if (this.pattern === 'TERRAIN_LAUNCH') {
        // 待機中は完全に画面外へ（-50 だと先端が左上に覗いていた）
        this.x = this.vx > 0 ? -this.width - 80 : CANVAS_WIDTH + 80;
        this.y = this.formationY;
      } else {
        this.x = -100;
        this.y = -100;
      }
      return false;
    }

    // メテオ系敵が画面内へ突入開始した瞬間にレーザー音を鳴らす
    if (prevPatternTimer < 0 && this.patternTimer >= 0) {
      if (this.pattern === 'METEOR_STRAIGHT' || this.pattern === 'METEOR_DIAGONAL') {
        this.justFiredLaser = true;
      }
    }

    if (this.animTimer >= 0.22) {
      this.animTimer = 0;
      this.animFrame = 1 - this.animFrame;
    }

    switch (this.pattern) {
      // ★ ギャプラス＆ギャラガ完全再現：曲線で連なって流れる美しい大編隊！（速度・旋回力UP！）
      case 'STREAM_CURVE': {
        // ★ ユーザー要望：登場時（曲線の序盤）は5割速く進入し、その後の旋回は従来（1.15）の2/3程度に緩和
        const entrySpeed = this.streamProgress < 1.2 ? 0.77 * 1.5 : 0.77;
        this.streamProgress += dt * entrySpeed;
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
        if (this.isBoss) {
          // ボスはS字を描いて左右に動きながら上昇し、中央でプレイヤーを轢き殺すのを防止
          this.y += this.vy * dt;
          this.x = CANVAS_WIDTH / 2 + Math.sin(this.timeAlive * 2.8) * 110 - this.width / 2;
          if (this.y < 85) {
            this.pattern = 'IN_FORMATION';
            this.bossPhase = 'WIDE_SWEEP'; // 上昇完了後は即座に左右大旋回へ！
            this.bossPhaseTimer = 0;
          }
        } else {
          this.x += this.vx * dt;
          this.y += this.vy * dt;
          if (this.y < 90) {
            this.pattern = 'FORMATION_LOOP';
          }
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
        // ★ ユーザー要望：ボス専用3態ダイナミックAI（左右大旋回・前進急接近後退・ホバリング）
        // 「ステージ3のボス 画面中央で泊まっているとスクロールしているので避けようがなく死ぬ 左右にも動いて」
        if (this.isBoss && this.rank !== 'SPACE_SERPENT_HEAD' && this.rank !== 'SERPENT_BODY') {
          this.bossPhaseTimer += dt;

          switch (this.bossPhase) {
            case 'HOVER_BARRAGE': {
              // 1. 左右巡航移動弾幕（中央で静止留まりせず、左右へ幅広く±120px遊泳しながら射撃）
              this.x = CANVAS_WIDTH / 2 + Math.sin(this.bossPhaseTimer * 1.5) * 125 - this.width / 2;
              this.y = this.formationY + Math.cos(this.bossPhaseTimer * 1.8) * 14;

              if (this.bossPhaseTimer >= 2.6) {
                this.bossPhase = 'WIDE_SWEEP';
                this.bossPhaseTimer = 0;
              }
              break;
            }

            case 'WIDE_SWEEP': {
              // 2. 画面横幅いっぱいの大旋回スイープ（4.8秒間：画面左右端まで大きく振り子スイング！）
              const sweepProgress = this.bossPhaseTimer / 4.8;
              const angle = sweepProgress * Math.PI * 2.5;
              this.x = CANVAS_WIDTH / 2 + Math.sin(angle) * (CANVAS_WIDTH * 0.38) - this.width / 2;
              this.y = this.formationY + Math.sin(angle * 2) * 35;

              if (this.bossPhaseTimer >= 4.8) {
                // ★ ユーザー要望：ボス、時々10秒に一回くらいでいいので画面中央下の方まで来て戻る、あるいは画面下にまっすぐ降りてそのまま下に消えて上から戻る
                // 周期（2.6s + 4.8s + 3.4s ≒ 10.8秒）で、画面中央下部への急降下突進と、画面下突き抜けループを交互に発動！
                this.bossPhase = (this.bossDiveVariant % 2 === 0) ? 'DEEP_DIVE_RETREAT' : 'DIVE_THROUGH';
                this.bossDiveVariant++;
                this.bossPhaseTimer = 0;
              }
              break;
            }

            case 'DEEP_DIVE_RETREAT': {
              // ★ 突進パターン1：画面中央下部（自機目前 y=560）まで猛突進して威嚇後、上空へ急上昇して戻る！
              const t = this.bossPhaseTimer;
              const forwardY = 560; // 画面中央下部、下で待機する自機（y=600〜650）の目前まで迫る！
              const targetX = CANVAS_WIDTH / 2 - this.width / 2;

              if (t < 1.4) {
                // 0.0〜1.4s: 画面中央下部へ急加速で猛突進！
                const ratio = t / 1.4;
                const ease = Math.sin((ratio * Math.PI) / 2);
                this.y = this.formationY + (forwardY - this.formationY) * ease;
                this.x = this.formationX + (targetX - this.formationX) * ease;
              } else if (t < 2.0) {
                // 1.4〜2.0s: 画面中央下部で威嚇ホバリング（激しく震動しながら滞空し、居座りを強制排除！）
                this.y = forwardY + Math.sin((t - 1.4) * 16) * 10;
                this.x = targetX + Math.sin((t - 1.4) * 14) * 25;
              } else if (t < 3.4) {
                // 2.0〜3.4s: 上空の定位置（formationY）へ急上昇して帰還！
                const ratio = (t - 2.0) / 1.4;
                const ease = Math.sin((ratio * Math.PI) / 2);
                this.y = forwardY - (forwardY - this.formationY) * ease;
                this.x = targetX + Math.sin(t * 4) * 30 * (1 - ratio);
              } else {
                this.y = this.formationY;
                this.x = this.formationX;
                this.bossPhase = 'HOVER_BARRAGE';
                this.bossPhaseTimer = 0;
              }
              break;
            }

            case 'DIVE_THROUGH': {
              // ★ 突進パターン2：画面下にまっすぐ降りてそのまま下に消えて上から戻る！
              const t = this.bossPhaseTimer;
              const targetX = CANVAS_WIDTH / 2 - this.width / 2;

              if (t < 1.6) {
                // 0.0〜1.6s: 画面中央下へ一直線に高速急降下し、画面外下端まで突き抜ける！
                const diveSpeed = 520;
                this.y += diveSpeed * dt;
                this.x += (targetX - this.x) * 4.0 * dt;

                // 画面最下部を完全に突き抜けて消えたら、画面最上部（y = -this.height - 40）へワープ！
                if (this.y > CANVAS_HEIGHT + this.height + 20) {
                  this.y = -this.height - 40;
                  this.x = targetX;
                }
              } else if (t < 3.0) {
                // 1.6〜3.0s: 画面上から定位置（formationY）へとスムーズに着陸降下！
                const returnRatio = Math.min(1, (t - 1.6) / 1.4);
                const ease = Math.sin((returnRatio * Math.PI) / 2);
                const startTopY = -this.height - 40;
                this.y = startTopY + (this.formationY - startTopY) * ease;
                this.x = targetX + Math.sin(t * 3) * 15 * (1 - returnRatio);
              } else {
                this.y = this.formationY;
                this.x = this.formationX;
                this.bossPhase = 'HOVER_BARRAGE';
                this.bossPhaseTimer = 0;
              }
              break;
            }
          }
          break;
        }

        // 通常ザコの陣形ゆらぎ
        const waveX = Math.sin(formationOffsetAngle) * 22;
        const waveY = Math.cos(formationOffsetAngle * 2) * 6;
        this.x = this.formationX + waveX;
        this.y = this.formationY + waveY;

        // ★ ユーザー要望：体当たりしてくる敵（ギャラガ風味の果敢な急降下ダイブ！）
        if (canDive && this.patternTimer > 1.0 + Math.random() * 2.5) {
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
        if (this.patternTimer < 0.40) {
          this.diveAngle += 7.5 * dt;
          this.x += Math.cos(this.diveAngle) * 120 * dt;
          this.y += Math.sin(this.diveAngle) * 120 * dt;
        } else {
          // 自機の現在位置を追尾しながら急降下（体当たり狙い！）
          const dx = playerX - this.x;
          const dy = (playerY + 50) - this.y;
          const dist = Math.hypot(dx, dy) || 1;
          const speed = 250 + (this.rank.startsWith('GIANT') ? 40 : 20);
          this.x += (dx / dist) * speed * dt;
          this.y += Math.max(120, (dy / dist) * speed) * dt;

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
      // ★ 7面：アトミック・ファントム「静止 → 震える予兆 → 鋭角急加速突撃」
      case 'ATOMIC_CHARGE': {
        if (this.chargeState === 'DESCEND') {
          // 上部の待機高度まで降りてくる
          this.y += this.vy * dt;
          if (this.y >= this.formationY) {
            this.y = this.formationY;
            this.chargeState = 'HOVER';
            this.chargeTimer = 0.9 + Math.random() * 0.5;
          }
        } else if (this.chargeState === 'HOVER') {
          // 静止。残り0.4秒で小刻みに震えて予兆を見せる
          this.chargeTimer -= dt;
          if (this.chargeTimer < 0.4) {
            this.x += (Math.random() - 0.5) * 6;
          } else {
            this.x += Math.sin(this.timeAlive * 3) * 20 * dt;
          }
          if (this.chargeTimer <= 0) {
            // 自機の現在位置へ向けて鋭角に突撃開始（狙いはこの瞬間に固定）
            const dx = playerX - (this.x + this.width / 2);
            const dy = playerY + 20 - (this.y + this.height / 2);
            const dist = Math.hypot(dx, dy) || 1;
            this.chargeDirX = dx / dist;
            this.chargeDirY = Math.max(0.25, dy / dist);
            this.chargeSpeed = 80;
            this.chargeState = 'CHARGE';
            justStartedDive = true;
          }
        } else if (this.chargeState === 'CHARGE') {
          // 急加速（80 → 760 px/s）
          this.chargeSpeed = Math.min(760, this.chargeSpeed + 1500 * dt);
          this.x += this.chargeDirX * this.chargeSpeed * dt;
          this.y += this.chargeDirY * this.chargeSpeed * dt;
          if (this.y > CANVAS_HEIGHT + 40 || this.x < -80 || this.x > CANVAS_WIDTH + 80) {
            // 画面外へ抜けたら上部から再突入（別のX位置）
            this.x = 60 + Math.random() * (CANVAS_WIDTH - 120 - this.width);
            this.y = -50 - Math.random() * 120;
            this.formationY = 70 + Math.random() * 90;
            this.chargeState = 'DESCEND';
          }
        }
        break;
      }

      // ★ 7面：ベータ・ファントム「翼を広げて横スイープ → 自機の真上で翼を畳んで垂直ダイブ」
      case 'BETA_WING_SWEEP': {
        if (this.betaState === 'SWEEP') {
          this.x += this.vx * dt;
          // 翼のはためきに合わせて上下にうねる
          this.y += Math.sin(this.timeAlive * 5) * 45 * dt;
          const cx = this.x + this.width / 2;
          // 自機のほぼ真上（±26px）を通過した瞬間、翼を畳んで急降下！
          if (Math.abs(cx - playerX) < 26 && this.y < playerY - 60) {
            this.betaState = 'DIVE';
            this.vy = 140;
            justStartedDive = true;
          }
          // 画面端で折り返し（2回折り返したら次の高さへ）
          if (this.x < -70 && this.vx < 0) {
            this.vx = Math.abs(this.vx);
            this.betaTurns++;
            this.y = 90 + Math.random() * 200;
          } else if (this.x > CANVAS_WIDTH + 70 && this.vx > 0) {
            this.vx = -Math.abs(this.vx);
            this.betaTurns++;
            this.y = 90 + Math.random() * 200;
          }
        } else {
          // 垂直ダイブ：加速しながら真下へ
          this.vy = Math.min(620, this.vy + 900 * dt);
          this.y += this.vy * dt;
          if (this.y > CANVAS_HEIGHT + 40) {
            // 画面外へ抜けたら左右どちらかから再スイープ
            const fromLeft = Math.random() > 0.5;
            this.x = fromLeft ? -60 : CANVAS_WIDTH + 60;
            this.y = 90 + Math.random() * 200;
            this.vx = (fromLeft ? 1 : -1) * 170;
            this.betaState = 'SWEEP';
          }
        }
        break;
      }

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
          this.y += 65 * dt; // リズミカルな急降下
          this.eyeLookX = this.movingRight ? 1 : -1;

          // 画面左右端に達したら一段「ガクン」と急降下して方向転換（階段移動）
          const leftLimit = 20;
          const rightLimit = CANVAS_WIDTH - 20 - this.width;

          if (this.x <= leftLimit && !this.movingRight) {
            this.x = leftLimit;
            this.movingRight = true;
            this.vx = 200;
            this.y += 44; // ガクンと一段大きく下降！
          } else if (this.x >= rightLimit && this.movingRight) {
            this.x = rightLimit;
            this.movingRight = false;
            this.vx = -200;
            this.y += 44; // ガクンと一段大きく下降！
          }

          // ★ ムーンクレスタ完全再現：画面下端を抜けたら天頂から再突入し、倒されるまで何度もループ急襲！
          if (this.y > CANVAS_HEIGHT + 20) {
            this.y = -45;
            this.x = 40 + Math.random() * (CANVAS_WIDTH - 80 - this.width);
            this.movingRight = Math.random() > 0.5;
            this.vx = (this.movingRight ? 1 : -1) * 200;
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

      // ★ コナミ・スクランブル風ミサイル：壁や端から横・斜めへ推進加速！（抜けたら反対側から再突入）
      case 'TERRAIN_LAUNCH': {
        // ★ ユーザー要望：全てのロケットは必ず予備動作（壁際で上下に揺れる）を見せてから突っ込む
        //   スクリプト出現のものも、初回起動時に画面端へ配置して予備動作を開始する
        if (!this.terrainArmed) {
          this.terrainArmed = true;
          if (this.prelaunchTimer <= 0) {
            this.prelaunchTimer = 1.3;
            this.prelaunchBaseY = this.y;
          }
          // ★ ユーザー要望：予備動作の位置は必ず画面の左端か右端（出どころに関わらず統一）
          this.x = this.vx >= 0 ? 12 : CANVAS_WIDTH - this.width - 12;
        }
        // ★ 予備動作：壁から顔を出し、上下に揺れて「どこから刺すか」を見せてから発射
        if (this.prelaunchTimer > 0) {
          this.prelaunchTimer -= dt;
          const elapsed = 1.3 - this.prelaunchTimer;
          // 揺れは次第に速く・大きく（最大±30px）
          const amp = Math.min(30, 8 + elapsed * 22);
          this.y = this.prelaunchBaseY + Math.sin(elapsed * 9) * amp;
          if (this.prelaunchTimer <= 0) {
            // 発射！狙いは最後に揺れていた高さ。少し勢いを付けて突進
            this.prelaunchBaseY = this.y;
            this.vx *= 1.5;
          }
          break;
        }
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vx *= 1.004; // 緩やかな加速
        this.vy *= 1.003;

        // 画面外へ抜けたら消滅させず、反対側・別高度から再突入（再突入時も必ず予備動作を見せる）
        if (this.x < -60) {
          this.x = CANVAS_WIDTH - this.width - 12;
          this.y = 80 + Math.random() * (CANVAS_HEIGHT * 0.5);
          this.vx = -Math.abs(this.vx) * 0.6;
          this.prelaunchTimer = 1.3;
          this.prelaunchBaseY = this.y;
        } else if (this.x > CANVAS_WIDTH + 60) {
          this.x = 12;
          this.y = 80 + Math.random() * (CANVAS_HEIGHT * 0.5);
          this.vx = Math.abs(this.vx) * 0.6;
          this.prelaunchTimer = 1.3;
          this.prelaunchBaseY = this.y;
        }
        if (this.y > CANVAS_HEIGHT + 60) {
          this.y = -30;
        }
        break;
      }

      // ★ 超高速直進メテオ：上から一直線急降下！（抜けたら上部から再突入）
      case 'METEOR_STRAIGHT': {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        if (this.y > CANVAS_HEIGHT + 50) {
          this.y = -50;
          this.x = 40 + Math.random() * (CANVAS_WIDTH - 80);
          this.vy = 420 + Math.random() * 80;
          this.justFiredLaser = true;
        }
        if (this.x < -40) this.x = CANVAS_WIDTH + 30;
        else if (this.x > CANVAS_WIDTH + 40) this.x = -30;
        break;
      }

      // ★ ユーザー要望：斜めに素早く画面をすり抜けるメテオ（抜けたら反対側上空から再突入）
      case 'METEOR_DIAGONAL': {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        if (this.y > CANVAS_HEIGHT + 50 || this.x < -60 || this.x > CANVAS_WIDTH + 60) {
          const fromLeft = Math.random() > 0.5;
          this.x = fromLeft ? -30 : CANVAS_WIDTH + 30;
          this.y = -40 + Math.random() * 80;
          this.vx = (fromLeft ? 1 : -1) * (260 + Math.random() * 100);
          this.vy = 320 + Math.random() * 80;
          this.justFiredLaser = true;
        }
        break;
      }

      // ★ ユーザー要望：スターフォースの「ガリ」の動き！
      // 「ガリはもう少し画面下部まで突っ込んできて」
      // 画面上部から猛スピードで画面下部（自機直前：y >= 500）まで深く急降下→急停止スウィング→角度を変えて超高速ダッシュ！
      case 'STARFORCE_GARI_MOVE': {
        const t = this.patternTimer % 4.6;
        if (t < 1.25) {
          // フェーズ1: 画面下部（自機の目前）まで超高速ストレート急降下！
          this.y += 440 * dt;
        } else if (t < 2.1) {
          // フェーズ2: 自機直前でキュキュッと急停止＆小刻みな横スウィング（ガリの真骨頂！）
          this.x += Math.sin((t - 1.25) * 18) * 150 * dt;
        } else if (t < 3.6) {
          // フェーズ3: 自機の方向を狙って電光石火の斜め急加速ダッシュ！
          if (t - dt < 2.1) {
            const dx = playerX - this.x;
            const dy = playerY - this.y;
            const dist = Math.hypot(dx, dy) || 1;
            this.vx = (dx / dist) * 440;
            this.vy = Math.max(180, (dy / dist) * 440);
          }
          this.x += this.vx * dt;
          this.y += this.vy * dt;
        } else {
          // 画面外を回って上空へ
          this.y += this.vy * dt;
          this.x += this.vx * dt;
        }

        // 画面下・外に出たら上空から再突入！死ぬまでループ
        if (this.y > CANVAS_HEIGHT + 40 || this.x < -80 || this.x > CANVAS_WIDTH + 80) {
          this.y = -40;
          this.x = Math.max(40, Math.min(CANVAS_WIDTH - 60, playerX + (Math.random() - 0.5) * 180));
          this.patternTimer = 0;
          this.vx = 0;
          this.vy = 400;
        }
        break;
      }

      // ★ ユーザー要望：スターフォース名物：左右端をまっすぐ落ちてきて、自機と縦座標が合うと90度曲がって突っ込んでくる！
      case 'STARFORCE_CORNER_DIVE': {
        if (!this.turned90) {
          // フェーズ1: 画面左右端を真下へ垂直急降下
          this.y += this.vy * dt;
          // 自機のY座標と縦座標が合ったら90度直角旋回！
          if (this.y >= playerY - 12) {
            this.turned90 = true;
            this.vy = 0;
            const toRight = this.x < CANVAS_WIDTH / 2;
            this.vx = (toRight ? 1 : -1) * 440; // 自機へ向かって水平フル加速！
          }
        } else {
          // フェーズ2: 横方向へ電光石火の突進！
          this.x += this.vx * dt;
        }

        // 画面外へ抜けたら左右端上空から再突入
        if (this.x < -60 || this.x > CANVAS_WIDTH + 60 || this.y > CANVAS_HEIGHT + 40) {
          this.turned90 = false;
          const startLeft = Math.random() > 0.5;
          this.x = startLeft ? 28 : CANVAS_WIDTH - 28 - this.width;
          this.y = -40;
          this.vx = 0;
          this.vy = 280;
        }
        break;
      }

      // ★ ユーザー要望：グラディウス／沙羅曼蛇の「開幕編隊」（画面最下部の自機まで容赦なく急降下突進！）
      // 「ムーンクレスタって、このゲームもだけど玉を打たないから体当たりでダメージなんだよね
      //   weve２のあかいやつ、したまでおりてこないからただのやられやく」
      case 'GRADIUS_FLEET': {
        const t = this.patternTimer % 4.2;
        if (t < 1.7) {
          // フェーズ1: 猛烈なスピードで画面最下部（自機の目前〜足元 y ≈ 660）まで一直線に急降下突進！
          this.y += 420 * dt;
          // 自機に接近するにつれて自機のX座標を狙って強引に寄せる（体当たり急襲！）
          if (this.y > 240) {
            const dx = playerX - this.x;
            this.x += Math.sign(dx) * 95 * dt;
          }
        } else if (t < 2.5) {
          // フェーズ2: 画面最下部（自機と同じ深さ y ≈ 560〜660）で鋭く横切る大スウィープ！
          const turnDir = (this.formationX > CANVAS_WIDTH / 2) ? -1 : 1;
          this.x += turnDir * 280 * dt;
          this.y += 75 * dt; // 下端へ抜けながら横切る
        } else {
          // フェーズ3: 画面下端を突き抜けて離脱！
          this.y += 340 * dt;
        }

        // 画面下端（または左右端）を抜けたら即座に上空から再突入！死ぬまでエンドレス急降下
        if (this.y > CANVAS_HEIGHT + 40 || this.x < -60 || this.x > CANVAS_WIDTH + 60) {
          this.y = -40;
          this.x = Math.max(40, Math.min(CANVAS_WIDTH - 40, playerX + (Math.random() - 0.5) * 180));
          this.patternTimer = 0;
        }
        break;
      }

      // ★ ユーザー要望：多少横に動いたあと、縦や横に高速で飛んでいくミサイル
      case 'DELAYED_DART': {
        const t = this.patternTimer % 3.8;
        if (t < 1.2) {
          // フェーズ1: 索敵モード（ふわふわと横へ慣性浮遊）
          this.x += this.vx * dt;
          this.y += Math.sin(this.timeAlive * 6) * 20 * dt;
        } else if (t < 1.5) {
          // フェーズ2: ロックオン予兆（小刻み振動）
          this.x += (Math.random() - 0.5) * 4;
        } else {
          // フェーズ3: アフターバーナー点火！縦（自機方向）または横へ超高速突進（500px/s）！
          if (t - dt < 1.5) {
            // 直下に急降下するか、横一直線に走るかをランダム選択
            const isVertical = Math.random() > 0.4;
            if (isVertical) {
              this.vx = (playerX - this.x) * 0.5;
              this.vy = 480;
            } else {
              this.vx = (playerX > this.x ? 1 : -1) * 520;
              this.vy = 40;
            }
          }
          this.x += this.vx * dt;
          this.y += this.vy * dt;
        }

        // 画面外に抜けたら消滅させず、別の位置から再突入！
        if (this.y > CANVAS_HEIGHT + 40 || this.x < -60 || this.x > CANVAS_WIDTH + 60) {
          this.patternTimer = 0;
          const fromLeft = Math.random() > 0.5;
          this.x = fromLeft ? 30 : CANVAS_WIDTH - 30;
          this.y = 70 + Math.random() * 140;
          this.vx = (fromLeft ? 1 : -1) * 80;
          this.vy = 20;
        }
        break;
      }

      // ★ ユーザー要望：左右がつながっているルールを活用した敵！
      // 右端に行くと左端からワープして飛び出し、左端に行くと右端から飛び出して連続掃射！
      case 'SIDE_WRAP_SWEEP': {
        this.x += this.vx * dt;
        this.y += (this.vy + Math.sin(this.timeAlive * 3) * 30) * dt;

        // 右端を抜けたら即座に左端からそのままの勢いで再突入！
        if (this.vx > 0 && this.x > CANVAS_WIDTH + 20) {
          this.x = -this.width - 10;
          this.y += 28; // ワープするたびに少しずつ降下して自機に迫る
        }
        // 左端を抜けたら即座に右端からそのままの勢いで再突入！
        else if (this.vx < 0 && this.x < -this.width - 20) {
          this.x = CANVAS_WIDTH + 10;
          this.y += 28; // ワープするたびに少しずつ降下して自機に迫る
        }

        // 下端に抜けた場合は上空から再突入
        if (this.y > CANVAS_HEIGHT + 30) {
          this.y = 70 + Math.random() * 80;
        }
        break;
      }

      // ★ 超高速フライバイ：画面横外から一瞬で全画面を突き抜ける（抜けたら反対側から再突入）
      case 'FLYBY_CROSS': {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        if (this.x < -80) {
          this.x = CANVAS_WIDTH + 60;
          this.y = 80 + Math.random() * (CANVAS_HEIGHT * 0.45);
        } else if (this.x > CANVAS_WIDTH + 80) {
          this.x = -60;
          this.y = 80 + Math.random() * (CANVAS_HEIGHT * 0.45);
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
      // 1. ギャラガ8の字ループ（リサジューインフィニティ：画面横幅・下部まで大きく旋回！）
      case 'FIGURE_EIGHT': {
        const angle = t * Math.PI * 1.35;
        const x = cx + Math.sin(angle) * (CANVAS_WIDTH * 0.44);
        const y = 300 + Math.sin(angle * 2) * 260; // y: 40 〜 560 まで大きく旋回
        return { x: x - this.width / 2, y: y - this.height / 2 };
      }

      // 2. 左から優雅なS字蛇行で画面を渡る（自機がいる下部 y ≈ 620 まで深く急降下スウィング！）
      case 'S_CURVE_LEFT_TO_RIGHT': {
        const progressX = (t / 4.0) * (CANVAS_WIDTH + 140) - 70;
        const dip = Math.sin((t / 4.0) * Math.PI) * 520;
        const y = 80 + dip + Math.sin(t * 3.0) * 50; // 最大 y ≈ 650
        return { x: progressX - this.width / 2, y: y - this.height / 2 };
      }

      // 3. 右から優雅なS字蛇行で画面を渡る（自機がいる下部 y ≈ 620 まで深く急降下スウィング！）
      case 'S_CURVE_RIGHT_TO_LEFT': {
        const progressX = CANVAS_WIDTH + 70 - (t / 4.0) * (CANVAS_WIDTH + 140);
        const dip = Math.sin((t / 4.0) * Math.PI) * 520;
        const y = 80 + dip + Math.cos(t * 3.0) * 50; // 最大 y ≈ 650
        return { x: progressX - this.width / 2, y: y - this.height / 2 };
      }

      // 4. 左からのダイナミック宙返りループ（画面下部まで落ちてから上昇）
      case 'INFINITY_DIVE_LEFT': {
        const angle = t * 2.8;
        const x = cx - 110 + Math.cos(angle) * 150;
        const y = 180 + Math.sin(angle) * 160 + t * 90;
        return { x: x - this.width / 2, y: y - this.height / 2 };
      }

      // 5. 右からのダイナミック宙返りループ（画面下部まで落ちてから上昇）
      case 'INFINITY_DIVE_RIGHT': {
        const angle = -t * 2.8;
        const x = cx + 110 + Math.cos(angle) * 150;
        const y = 180 + Math.sin(angle) * 160 + t * 90;
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
    // ★ ユーザー要望：ギャラガ風旋回機（緑・赤・黄）はもう一回り大きく表示
    const isGalagaSmall = this.rank === 'GREEN_DRONE' || this.rank === 'RED_GUARD' || this.rank === 'YELLOW_COMMANDER';
    let s = isGiant ? 2.8 : (isGalagaSmall ? 1.65 : 1.4);
    if (this.isBoss) {
      s *= 2.0; // ボスの表示サイズを2倍に！
    }

    // ★ ユーザー要望：ムーンクレスタ1面風の登場演出
    // 「何もないところから点が生まれてそれが拡大して敵になるようなムーンクレスタ一面のような登場」
    if ((this.pattern === 'MOON_COLD_EYE' || this.pattern === 'MOON_SUPER_EYE') && this.spawnAnimationTimer < 0.6) {
      const p = Math.min(1.0, this.spawnAnimationTimer / 0.6);
      // 0.0〜0.6秒にかけて小さな点（0.08）から徐々に拡大（1.0）
      const spawnScale = 0.08 + 0.92 * (p * p);
      s *= spawnScale;
      // 生まれる瞬間のピクセル閃光
      if (p < 0.7 && Math.floor(this.timeAlive * 30) % 2 === 0) {
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 16;
      }
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
      // ユーザー要望：横から飛んでくるミサイル、倍サイズで
      case 'TERRAIN_MISSILE': {
        // 飛行方向（左右）に合わせて反転
        const dir = this.vx >= 0 ? 1 : -1;
        ctx.scale(dir * 1.8, 1.8);

        // 1. 細身で長いロケット胴体（白/ライトグレー 30x8）
        ctx.fillStyle = '#e8f0f8';
        ctx.fillRect(-15, -4, 26, 8);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(-15, 0, 26, 4); // 胴体下部シャドウ

        // 2. 胴体中央の赤い識別帯（レトロSF感）
        ctx.fillStyle = '#ff0033';
        ctx.fillRect(-2, -4, 4, 8);

        // 3. 先端の尖った流線型ノーズコーン（赤）
        ctx.beginPath();
        ctx.moveTo(17, 0);       // 先端
        ctx.lineTo(11, -4.5);
        ctx.lineTo(11, 4.5);
        ctx.closePath();
        ctx.fill();

        // 4. 上下の尾翼・スタビライザー（黄色/オレンジ）
        ctx.fillStyle = '#ffaa00';
        // 上翼
        ctx.beginPath();
        ctx.moveTo(-15, -4);
        ctx.lineTo(-10, -4);
        ctx.lineTo(-14, -8);
        ctx.closePath();
        ctx.fill();
        // 下翼
        ctx.beginPath();
        ctx.moveTo(-15, 4);
        ctx.lineTo(-10, 4);
        ctx.lineTo(-14, 8);
        ctx.closePath();
        ctx.fill();

        // 5. 後部ロケットノズル（ダークグレー）
        ctx.fillStyle = '#475569';
        ctx.fillRect(-17, -3, 2, 6);

        // 6. 後部ロケットアフターバーナー噴射炎（激しくチラつく炎）
        const flameLen = f === 0 ? 9 : 13;
        ctx.fillStyle = '#ff4400';
        ctx.beginPath();
        ctx.moveTo(-17, -3);
        ctx.lineTo(-17 - flameLen, 0);
        ctx.lineTo(-17, 3);
        ctx.closePath();
        ctx.fill();

        // コア高温炎（黄・白）
        ctx.fillStyle = f === 0 ? '#ffea00' : '#ffffff';
        ctx.beginPath();
        ctx.moveTo(-17, -1.5);
        ctx.lineTo(-17 - flameLen * 0.55, 0);
        ctx.lineTo(-17, 1.5);
        ctx.closePath();
        ctx.fill();
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

      // ★ スターフォース名物：ガリ（STARFORCE_GARI）菱形ボディ＋鋭利なウイング
      case 'STARFORCE_GARI': {
        ctx.fillStyle = '#00d0ff';
        ctx.fillRect(-10, -10, 20, 20); // 菱形コア
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(-14, -4, 28, 8);  // 翼
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-6, -6, 12, 12);
        ctx.fillStyle = f === 0 ? '#ff0033' : '#ff5500';
        ctx.fillRect(-3, -3, 6, 6);    // コア点滅
        break;
      }

      // ★ グラディウス／沙羅曼蛇：ファン編隊（GRADIUS_FAN）往年の扇形宇宙艇
      case 'GRADIUS_FAN': {
        ctx.fillStyle = '#ff3300';
        ctx.fillRect(-12, -8, 24, 6);
        ctx.fillRect(-8, -2, 16, 8);
        ctx.fillStyle = '#ffcc00';
        ctx.fillRect(-4, 6, 8, 4);
        ctx.fillStyle = f === 0 ? '#00ffff' : '#ffffff';
        ctx.fillRect(-6, -6, 4, 4);
        ctx.fillRect(2, -6, 4, 4);
        break;
      }

      // ★ 索敵急加速ミサイル（DART_MISSILE）倍サイズ描画！
      case 'DART_MISSILE': {
        // ★ バグ修正：進行方向に合わせて左右反転（左へ飛ぶ時に噴射口が前に来ていた）
        const dartDir = this.vx < 0 ? -1 : 1;
        ctx.scale(dartDir * 1.9, 1.9);
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(-8, -4, 16, 8);
        ctx.fillStyle = '#ff0044';
        ctx.fillRect(4, -6, 6, 12); // 弾頭
        ctx.fillStyle = f === 0 ? '#00e5ff' : '#ffffff';
        ctx.fillRect(-12, -3, 4, 6); // バーニア火花
        break;
      }

      // ★ 左右ループ走査機（SIDE_WARP_RUNNER）
      case 'SIDE_WARP_RUNNER': {
        ctx.fillStyle = '#00ff88';
        ctx.fillRect(-12, -5, 24, 10);
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(-6, -8, 12, 16);
        ctx.fillStyle = f === 0 ? '#ff00ff' : '#00ffff';
        ctx.fillRect(-3, -3, 6, 6);
        // ワープ航行推進スラスター
        ctx.fillStyle = f === 0 ? '#ffaa00' : '#ffffff';
        ctx.fillRect(this.vx > 0 ? -15 : 11, -3, 4, 6);
        break;
      }

      // ★ スターフォース名物：90度直角旋回機（STARFORCE_CORNER）
      case 'STARFORCE_CORNER': {
        ctx.save();
        // 進行方向に向かって機首を向ける
        const moveAngle = this.turned90 ? (this.vx > 0 ? 0 : Math.PI) : Math.PI / 2;
        ctx.rotate(moveAngle);

        // 鋭利なデルタ翼戦闘機
        ctx.fillStyle = '#00d0ff';
        ctx.beginPath();
        ctx.moveTo(13, 0);
        ctx.lineTo(-11, -9);
        ctx.lineTo(-6, 0);
        ctx.lineTo(-11, 9);
        ctx.closePath();
        ctx.fill();

        // コア装甲
        ctx.fillStyle = '#ff0055';
        ctx.fillRect(-5, -4, 8, 8);

        // コア発光チップ
        ctx.fillStyle = f === 0 ? '#ffea00' : '#ffffff';
        ctx.fillRect(-2, -2, 4, 4);

        // バーニア噴射
        ctx.fillStyle = f === 0 ? '#ffaa00' : '#ffffff';
        ctx.fillRect(-10, -2, 3, 4);

        ctx.restore();
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
