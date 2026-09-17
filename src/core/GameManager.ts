import {
  BLOCK_SIZE,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MAX_STAGES,
  PLAYER_FIRE_INTERVAL,
} from '../config';
import { FieldItem } from '../entities/Item';
import { ParticleManager } from '../effects/Particle';
import { PlayerBullet } from '../entities/Bullet';
import { Enemy, FlightPattern } from '../entities/Enemy';
import { Player } from '../entities/Player';
import { TetrominoPiece, TetrominoType } from '../entities/Tetromino';
import { drawMoonCrestaText } from '../utils/RetroFont';
import { Input } from './Input';
import { Sound } from './Sound';
import { Starfield } from './Starfield';
import { TerrainManager } from './Terrain';

export type GameState = 'TITLE' | 'PLAYING' | 'PAUSED' | 'STAGE_CLEAR' | 'GAMEOVER' | 'VICTORY';

// ★ Stage 10 最終面ボスラッシュ：歴代ボスが順番に襲来し、最後に最強UFO母船が登場！
type BossRank = 'GIANT_YELLOW' | 'GIANT_RED' | 'UFO_MOTHERSHIP' | 'GIGA_COLD_EYE' | 'SPACE_SERPENT_HEAD';
const BOSS_RUSH: { rank: BossRank; hp: number; pattern: FlightPattern }[] = [
  { rank: 'GIANT_YELLOW', hp: 28, pattern: 'FORMATION_LOOP' },
  { rank: 'GIANT_RED', hp: 36, pattern: 'SURPRISE_FROM_BOTTOM' },
  { rank: 'GIGA_COLD_EYE', hp: 36, pattern: 'FORMATION_LOOP' },
  { rank: 'SPACE_SERPENT_HEAD', hp: 40, pattern: 'SERPENT_SLITHER' },
  { rank: 'UFO_MOTHERSHIP', hp: 144, pattern: 'CAROUSEL_CIRCLE' }, // ★ ラスボス：HP 1.5倍（96→144）、動きは倍速
];
export type GamePhase = 'TETRIS' | 'SHOOTING';

// ★ ユーザー要望（Stage 5）：
//   「ミサイルの量を倍に。あと少しだけ、3面で出てくる “縦座標が合うと90度角度を変えて自機に向かってくる敵”
//     （STARFORCE_CORNER）を入れて。ミサイルとその敵は重ならないように配分」
//   → 壁際ミサイルは間隔を半分（＝倍の量）にしたうえで、
//     下記の時間帯だけミサイルを完全に止めて「90度直角旋回機」の担当時間にする。
//     （時間はシューティングフェーズ開始からの秒数。mp3版では別途 3 秒後ろへずらす）
const STAGE5_CORNER_WAVES: { quietStart: number; quietEnd: number; spawnAt: number }[] = [
  { quietStart: 18.0, quietEnd: 24.5, spawnAt: 18.4 },
  { quietStart: 32.5, quietEnd: 39.0, spawnAt: 32.9 },
];
// ★ ユーザー要望：「1編隊中の敵の数を倍に、その分一度に出てくる編隊の個数は減らす」。
//   1波あたり 4 → 8 機に倍増し、出現間隔も詰めて「バラバラに来る」から
//   「まとまった1編隊として来る」へ変えた（まとめて倒しやすく、同時に相手取る編隊は減る）
const STAGE5_CORNER_PER_WAVE = 8; // NORMAL の1波あたり機数（HARD は hc() で5割増）
const STAGE5_CORNER_SPAWN_STEP = 0.28; // 1機ごとの出現間隔（秒）。短いほど1編隊としてまとまる

// 落ちてくるブロックの状態（ドッキング用：自律浮遊＋弾ヒットで回転）
export interface FallingPieceItem {
  index: number;
  piece: TetrominoPiece;
  x: number; // ピクセル座標X（滑らかな自律ドリフト）
  y: number; // ピクセル座標Y
  vx: number; // ドリフト速度X
  vy: number; // 降下速度Y
  gx: number;
  gy: number;
  fallTimer: number;
  settled: boolean;
  dockCooldown?: number; // ショット直後の反動・誤合体防止クールダウン
  hitCount?: number; // ★ 弾を当てた回数（当てるたびに落下・左右速度が少しずつ上がる）
}

// 切断されて浮遊・落下中のパーツ（再回収可能）
export interface DetachedFloatingPiece {
  piece: TetrominoPiece;
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeTime: number;
}

export class GameManager {
  public state: GameState = 'TITLE';
  public phase: GamePhase = 'TETRIS';
  public stage = 1;
  public score = 0;
  public highScore = 0;
  private runStartHighScore = 0; // 今回のプレイ開始時点のハイスコア（新記録判定用）
  // ★ バリアオーブ出現ルール：ザコ撃破数が閾値の倍数に達するたびに1個出現。
  //   ★ ユーザー要望：プレイ全体の通算だと出現タイミングが毎回同じ場所になってしまうので、
  //     「ステージ開始からの撃破数」に変更した（startShootingPhase でリセット）。
  //   閾値は「敵の多い面の全敵の約2/3」＝ 40 機
  private static readonly BARRIER_KILL_INTERVAL = 40;
  // ★ EASY は敵の総数が 2/3 になるので、バリアが出る条件もそれに合わせて下げる
  private static readonly BARRIER_KILL_INTERVAL_EASY = 27;
  // ★ バリアの円に触れたボスへ与える毎秒ダメージ（ボスは焼き切りではなく削り）
  private static readonly BARRIER_BOSS_DPS = 6;
  // ★ ザコがバリアで焼き切れるまでの焼け量。
  //   ここで言う焼け量は「深さ×時間」。円の中心の深さで触れ続けた場合の秒数に相当する。
  //   ★ 重要：かすりと突撃は「円内にいた時間」では区別できない。
  //     円の横を縦に通り抜ける敵は、浅くても長く円内に留まるため
  //     （実測：6pxのかすりで0.083秒 ＞ 中心への突撃で0.067秒）。
  //     区別できるのは深さだけなので、焼け進行を深さで重み付けし、
  //     さらに外周側 BARRIER_BURN_DEAD_ZONE の帯は「かすり」として一切焼けないようにした。
  private static readonly BARRIER_BURN_TIME = 0.012;
  // 円の外周側の何割を「かすり（焼けない）」扱いにするか
  private static readonly BARRIER_BURN_DEAD_ZONE = 0.25;
  // 円の外へ出たとき、焼けが冷めていく速さ（秒あたり）
  private static readonly BARRIER_BURN_COOL = 1.5;
  private totalKills = 0;
  private nextBarrierKills = GameManager.BARRIER_KILL_INTERVAL;

  /** 難易度に応じたバリアオーブ出現の撃破数間隔 */
  private barrierKillInterval(): number {
    return this.difficulty === 'EASY'
      ? GameManager.BARRIER_KILL_INTERVAL_EASY
      : GameManager.BARRIER_KILL_INTERVAL;
  }
  // ★ ユーザー要望：イージーモードを追加（タイトルでは NORMAL の左）
  //   EASY は敵の数 2/3・ボスHP 2/3・バリア出現の必要撃破数も少なめ。
  //   バランスが大きく崩れそうなところ（地形ミサイルの密度、ボスの動きの速さ、
  //   ボスが出すザコの間隔など）は NORMAL のまま据え置いている。
  public difficulty: 'EASY' | 'NORMAL' | 'HARD' = 'NORMAL';
  private static readonly DIFFICULTIES: ('EASY' | 'NORMAL' | 'HARD')[] = ['EASY', 'NORMAL', 'HARD'];

  public player: Player;
  public starfield: Starfield;
  public particles: ParticleManager;
  public sound: Sound;
  public terrain: TerrainManager;

  // 切断されて落下中のパーツ（再回収可能）
  public detachedPieces: DetachedFloatingPiece[] = [];

  // 洞窟や敵から出現するフィールドアイテム（無敵バリア・救済カプセル）
  public fieldItems: FieldItem[] = [];

  // パズルフェーズ：落ちてくるブロック（1つずつ集中してドッキング）
  public fallingPieces: FallingPieceItem[] = [];
  public activePieceIndex = 0;
  public remainingPiecesCount = 1;

  // シューティングフェーズ：大編隊
  public playerBullets: PlayerBullet[] = [];
  public enemies: Enemy[] = [];
  public formationOffsetAngle = 0;
  public shootingTimeLimit = 48;
  private shootingTimeTotal = 65; // このステージのバトル総時間（ボス予告は残り32秒で発動）

  // ボス出現・撃破管理
  public bossSpawned = false;
  private lastScriptedSpawnTime = 0; // spawnAlienFleet で予定した最後のザコ出現時刻（秒）
  private rescueSpawnCount = 0; // このステージで出したレスキューの数（1つ目は画面中央最上部から出す）
  private lastInput: Input | null = null; // 直近フレームの入力（指位置レティクルHUD描画用）
  private touchTapFilterFn = (x: number, y: number): boolean => this.tryTouchRotatePiece(x, y);
  // ★ click しか届かないアプリ内ブラウザ用の代替操作
  private clickMoveTargetX: number | null = null;
  private clickMoveTargetY: number | null = null;
  private clickFireTimer = 0;
  private debugQueryForced: boolean | null = null; // ?debug=1 の判定キャッシュ
  private stageTextDelay = 0; // mp3 イントロ待ち：0 になった時点で「STAGE n」表示＆本編開始
  public currentBoss: Enemy | null = null;
  public bossDying = false;
  public bossDeathTimer = 0;
  // ★ Stage 10 ボスラッシュ：現在何体目のボスか
  public bossRushIndex = 0;
  private bossMinionTimer = 0; // ボスが部下を定期的に召喚するタイマー

  // 80年代アーケード風ゲームフィール：画面揺れ（シェイク）＆ヒットストップ
  public screenShake = 0;
  public hitStopTimer = 0;
  public terrainHitCooldown = 0;
  public isInvincibleMode = false; // 撮影用無敵モード

  // バトル中に落ちてくる救済テトリミノ（Oミノのみになった時の緊急ドッキング）
  public battlePiece: FallingPieceItem | null = null;
  public gameOverSelection: 'CONTINUE' | 'TITLE' = 'CONTINUE';
  public pauseMenuSelection: 'RESUME' | 'RESTART_STAGE' | 'TITLE' = 'RESUME';
  // ★ タイトル画面のカーソル行（難易度 / ステージ）。初期は難易度（NORMAL）に合わせる
  // ★ ユーザー要望：タイトルの並びは 上から START / 難易度 / ステージセレクト。
  //   最初のカーソルは START に合わせる（難易度の初期値は NORMAL のまま）
  public titleMenuSelection: 'START' | 'DIFFICULTY' | 'STAGE' = 'START';
  private static readonly TITLE_ROWS: ('START' | 'DIFFICULTY' | 'STAGE')[] = ['START', 'DIFFICULTY', 'STAGE'];
  // タイトルの各行の枠（Y座標と高さ）。入力の当たり判定と描画で共有する。
  // ★ ユーザー要望：START は大きな文字で画面の真ん中あたり（以前の難易度の位置）に置き、
  //   その下に難易度・ステージセレクトを並べる
  private static readonly TITLE_ROW_Y = { START: 424, DIFFICULTY: 496, STAGE: 548 };
  private static readonly TITLE_ROW_H = { START: 60, DIFFICULTY: 44, STAGE: 44 };
  public selectedStage: number = 1; // タイトル画面＆ポーズ画面で選べるステージ (1〜10)
  private rescueSpawnCooldown = 0;
  // ★ ユーザー要望：救済テトリミノは1つ目も2つ目以降も3秒後
  // ★ ユーザー要望：最初のレスキューテトリミノは 3.0 → 1.5 秒後（早く武装できるように）
  private static readonly RESCUE_FIRST_DELAY = 1.5;
  private static readonly RESCUE_NEXT_DELAY = 3.0;
  public dockingTimer = 30.0; // ユーザー要望：ドッキングせよ 30.0から減っていく

  private deathDelay = 0; // 自機爆発アニメーション用ディレイ
  private lastDeathPopTime = 0; // 死亡演出中の連続爆発音の最終再生時刻
  private playerDeathSoundPlayed = false; // プレイヤー死亡音再生フラグ
  private bossWarningActive = false; // ボス出現予告サイレン中か
  private bossWarningTimer = 0;      // ボス出現予告タイマー
  private stateTimer = 0;
  private transitionAlpha = 0;
  private transitionText = '';
  private transitionScale = 1.0;
  private fireLockout = 0; // ゲーム開始直後の誤射防止猶予タイマー

  constructor(sound: Sound) {
    this.sound = sound;
    this.player = new Player();
    this.starfield = new Starfield();
    this.particles = new ParticleManager();
    this.terrain = new TerrainManager();
    // ハイスコアをlocalStorageから復元
    // ★ バグ修正：itch.io等の他ドメインiframe埋め込みではSafariのクロスサイト・トラッキング防止で
    //   localStorageアクセス自体が例外を投げることがあり、ここで無防備だとコンストラクタが
    //   丸ごと失敗してゲームが一切起動しなくなる（タイトルの描画すら始まらない）
    try {
      const saved = localStorage.getItem('galaxtris_hiscore');
      if (saved) this.highScore = parseInt(saved, 10) || 0;
    } catch (e) {
      console.warn('highScore load failed:', e);
    }
  }

  public startNewGame(startStage?: number): void {
    this.stage = startStage !== undefined ? startStage : this.selectedStage;
    this.score = 0;
    this.runStartHighScore = this.highScore;
    this.totalKills = 0;
    this.nextBarrierKills = this.barrierKillInterval();
    this.fieldItems = [];
    this.player.barrierTimer = 0;
    this.player.barrierFrozen = false;
    this.deathDelay = 0;
    this.playerDeathSoundPlayed = false;
    this.bossWarningActive = false;
    this.bossWarningTimer = 0;
    this.sound.stopBossWarning();
    this.sound.stopClearMusic();
    this.player = new Player();
    this.player.isInvincible = this.isInvincibleMode;
    this.particles.clear();
    this.detachedPieces = [];
    this.state = 'PLAYING';
    this.fireLockout = 0.5; // ゲーム開始直後の誤射防止（0.5秒間発射不可）
    this.sound.playStartJingle(); // ムーンクレスタ風 開始ファンファーレ！
    this.startTetrisPhase();
  }

  // ==========================================
  // フェーズ移行
  // ==========================================
  private startTetrisPhase(): void {
    this.phase = 'TETRIS';
    this.stageTextDelay = 0;
    this.playerBullets = [];
    this.enemies = [];
    this.battlePiece = null;
    this.bossSpawned = false;
    this.bossWarningActive = false;
    this.bossWarningTimer = 0;
    this.playerDeathSoundPlayed = false;
    this.sound.stopBossWarning();
    this.currentBoss = null;
    this.bossDying = false;
    this.bossDeathTimer = 0;
    this.detachedPieces = [];

    // パズルフェーズでは地形オフ、上スクロール
    this.starfield.direction = 'UP';
    this.terrain.reset('UP', false);

    // 自機を下部中央へ再配置（ドッキングしやすくする）
    this.player.resetToBottomCenter();

    // 1度に1つのブロックを集中スポーン！
    this.spawnTetrominoes();
    this.remainingPiecesCount = 1;

    this.dockingTimer = 30.0;
    this.sound.playStartJingle();
    this.sound.startBGM('tetris');
    this.showTransitionText(`STAGE ${this.stage}`, 1.4);
  }

  private startShootingPhase(): void {
    this.phase = 'SHOOTING';
    this.fallingPieces = [];
    // バトル時間（★ 9面は「一種ずつ→中盤からコンボ」の構成を入れるため 80 秒に延長）
    // ★ ユーザー要望：5面はミサイル倍増＋90度直角旋回機を加えるため、
    //   ミサイルが飛ぶ時間を減らさずに済むよう 65 → 78 秒に延長する
    // ★ ユーザー要望：バリアオーブは「ステージ開始からの撃破数」で出す。
    //   通算だと毎回まったく同じ場所で出てしまい、驚きが無くなるため
    this.totalKills = 0;
    this.nextBarrierKills = this.barrierKillInterval();
    // ★ ユーザー要望：開始直後に地形へぶつかって即死することがあるので、
    //   ステージ開始から2秒は無敵にする。こちらは演出なし（見た目は通常どおり）
    this.player.spawnGraceTimer = Player.SPAWN_GRACE;
    this.player.graceTimer = 0;
    this.shootingTimeTotal = this.stage === 9 ? 100 : this.stage === 5 ? 78 : 65;
    this.shootingTimeLimit = this.shootingTimeTotal;
    this.bossRushIndex = 0;
    this.formationOffsetAngle = 0;
    this.battlePiece = null;
    this.rescueSpawnCooldown = GameManager.RESCUE_FIRST_DELAY;
    this.rescueSpawnCount = 0;
    this.bossSpawned = false;
    this.bossWarningActive = false;
    this.bossWarningTimer = 0;
    this.playerDeathSoundPlayed = false;
    this.sound.stopBossWarning();
    this.currentBoss = null;
    this.bossDying = false;
    this.bossDeathTimer = 0;

    // ユーザー要望：
    // 「ムーンクレスタフォロワーと、ギャラガフォロワーと、取りあえず交互に出して。沙羅曼蛇フォロワーもときどきまぜる 地形のある面で」
    // Wave 1: ムーンクレスタ（コールドアイ分裂＆スーパーアイ深宇宙）
    // Wave 2: ギャラガ（S字＆8の字ストリーム編隊・急降下ダイブ）
    // Wave 3: 沙羅曼蛇（縦スクロール・バンガード岩盤ブロック洞窟突破）
    // Wave 4: ムーンクレスタ（フォー・フライ＆怒涛のメテオゾーン）
    // Wave 5: ギャラガ＆沙羅曼蛇（斜めスクロール！宇宙浮遊要塞・高速侵攻）
    // Wave 6: 沙羅曼蛇（横スクロール・右方向バンガードブロック回廊）
    // Wave 7: ムーンクレスタ（アトミック・ファントム＆ベータ・ファントム強襲）
    // Wave 8: ギャラガ（インフィニティ大編隊＆四方包囲網）
    // Wave 9: 沙羅曼蛇（上下激動・高密度バンガードブロック迷宮）
    // Wave 10: 最終決戦（全フォロワー総力戦カタストロフィ）

    // ★ ユーザー要望：Stage 8 を地形のある左スクロール面に（Stage 6 右スクロールの反対向き）
    const isSalamander = this.stage === 3 || this.stage === 5 || this.stage === 6 || this.stage === 8 || this.stage === 9;
    let direction: 'UP' | 'RIGHT' | 'LEFT' | 'DIAGONAL_UP_RIGHT' = 'UP';
    if (this.stage === 5) {
      direction = 'DIAGONAL_UP_RIGHT';
    } else if (this.stage === 6) {
      direction = 'RIGHT';
    } else if (this.stage === 8) {
      direction = 'LEFT';
    }
    this.starfield.direction = direction;

    // 地形は「沙羅曼蛇フォロワー面」で有効化！
    this.terrain.reset(direction, isSalamander);
    // ★ ユーザー要望：3面は敵を一種類ずつにするため、壁面ミサイル発射台は出さない
    this.terrain.silosEnabled = this.stage !== 3;
    // ★ ユーザー要望：5面は開幕約10秒間、壁面発射台も起動させない
    this.terrain.siloStartDelay = (this.stage === 5 || this.stage === 9) ? 10.0 : 2.5;
    // HARD は壁際ロケットの間隔も詰める（260px → 175px ≒ 5割増）
    const siloSpacingBase = this.difficulty === 'HARD' ? 175 : 260;
    // ★ ユーザー要望：5面はミサイルの量を倍に（＝出現間隔を半分に）。HARD比率はそのまま維持
    // ★ ユーザー要望（追加）：「1編隊の数を倍に、一度に出てくる編隊の個数は減らす」。
    //   ミサイルにとっての「編隊」は1つの発射台からの斉射なので、
    //   発射台の数を減らし（間隔 1/2 → 3/4）、1台あたり3連射にした。
    //   総数は 1発/130px → 3発/195px ＝ 従来比2倍。相手取る発射台の数は 1/1.5 に減る
    this.terrain.siloSpacing = this.stage === 5 ? siloSpacingBase * 0.75 : siloSpacingBase;
    this.terrain.siloBurst = this.stage === 5 ? 3 : 1;
    // ★ ユーザー要望：5面はミサイルと90度直角旋回機が重ならないよう、時間帯で棲み分ける
    this.terrain.siloQuietWindows = this.stage === 5
      ? STAGE5_CORNER_WAVES.map(w => ({ start: w.quietStart, end: w.quietEnd }))
      : [];

    // ★ ユーザー要望：アイテムはステージ開始時の固定配置ではなく、撃破数に応じて出現（spawnBarrierOrb 参照）
    //   救済カプセルはいったん廃止。
    //   ★ ドッキング中に流れているオーブはここで消さない（取り逃した分はそのまま流れて画面外で消える）
    // ★ ここでバリアの凍結を解除＝残り時間のカウントはステージ開始から始まる
    this.player.barrierFrozen = false;

    // ギャラガ＆ムーンクレスタ風 多彩な大編隊をスポーン！
    this.spawnAlienFleet();

    this.sound.startBGM('shooting');
    // ★ ユーザー要望：mp3 ステージBGMがある版では、ドッキングした瞬間に曲を鳴らし始め、
    //   曲の3秒のイントロが終わってから「STAGE n」を表示してステージ本編を開始する
    if (this.sound.hasStageMusic()) {
      this.stageTextDelay = 3.0;
    } else {
      this.sound.playPhaseAlert('shooting');
      this.showTransitionText(`STAGE ${this.stage}`, 1.8);
    }
  }

  private showTransitionText(text: string, scale = 1.0): void {
    this.transitionText = text;
    this.transitionScale = scale;
    this.transitionAlpha = 1.0;
  }

  public update(dt: number, input: Input): void {
    this.lastInput = input; // 指位置レティクルHUDの描画用
    // ★ ユーザー要望（スマホ）：落下テトリミノへの直接タッチで回転＋ノックバック。
    //   Input 側はタップ開始位置をこのフィルタに問い合わせ、true なら
    //   そのタップを「回転操作」として消費する（自機は動かず、弾も出ない）
    input.touchTapFilter = this.touchTapFilterFn;
    // ★ 早期 return や例外があっても「単発押し」フラグの後始末を必ず行う。
    //   ここを取りこぼすと justMouseDown 等が立ちっぱなしになり、
    //   毎フレーム押し続けたのと同じ状態になって操作不能に見える。
    try {
      this.updateInner(dt, input);
    } finally {
      input.resetPerFrame();
    }
  }

  private updateInner(dt: number, input: Input): void {
    if (input.mutePressed) {
      this.sound.toggleMute();
    }

    // 画面右上の MUTE / PAUSE ボタンのクリック・タップ判定
    // ★ このボタンはプレイ中HUDのものなので TITLE では判定しない。
    //   （TITLE には専用のMUTEボタンがあり、ここを残すと画面上部に
    //     「押すと無音になるだけで何も起きない見えない当たり判定」が生まれてしまう）
    if (this.state !== 'TITLE' &&
        input.justMouseDown && input.mouseX !== null && input.mouseY !== null && input.mouseY >= 6 && input.mouseY <= 46) {
      if (input.mouseX >= 436 && input.mouseX <= 478) {
        this.sound.toggleMute();
        input.clearTransientInputs();
        return;
      } else if (input.mouseX >= 482 && input.mouseX <= 526) {
        input.justEscape = true;
      }
    }

    // 撮影用無敵モード切替（Iキー / Gキー）
    if (input.justInvincible) {
      this.isInvincibleMode = !this.isInvincibleMode;
      this.player.isInvincible = this.isInvincibleMode;
      this.sound.playDock();
      this.showTransitionText(this.isInvincibleMode ? '★ INVINCIBLE: ON ★' : '★ INVINCIBLE: OFF ★', 1.2);
    }

    // ESCキーでポーズ画面へ移行 / ポーズ解除（★ ユーザー要望：ESCのときは音を消す！）
    if (input.justEscape) {
      if (this.state === 'PLAYING' || this.state === 'STAGE_CLEAR') {
        this.state = 'PAUSED';
        this.screenShake = 0;
        this.selectedStage = this.stage; // ポーズ時は現在プレイ中のステージに初期化
        this.pauseMenuSelection = 'RESUME';
        this.sound.pauseBGM();
        this.sound.stopBossLfo();
        this.sound.stopBossWarning();
        input.clearTransientInputs();
        return;
      } else if (this.state === 'PAUSED') {
        this.state = 'PLAYING';
        this.sound.resumeBGM();
        if (this.bossWarningActive) {
          this.sound.playBossWarning();
        } else if (this.currentBoss && !this.currentBoss.isDead && !this.bossDying) {
          const lfoCategory = (this.currentBoss.rank === 'UFO_MOTHERSHIP' || this.currentBoss.rank === 'SPACE_SERPENT_HEAD') ? 1 : 2;
          this.sound.startBossLfo(lfoCategory);
        }
        input.clearTransientInputs();
        return;
      }
    }

    if (this.state !== 'PAUSED') {
      this.starfield.update(dt, (this.phase === 'SHOOTING' ? 2.4 : 1.2) * (this.stage === 5 && this.phase === 'SHOOTING' ? 4 / 9 : 1));
      this.particles.update(dt);

      if (this.transitionAlpha > 0) {
        this.transitionAlpha -= dt * 0.9;
      }
    }

    switch (this.state) {
      case 'TITLE':
        // 右上 MUTE ボタン
        if (input.justMouseDown && input.mouseX !== null && input.mouseY !== null && input.mouseY >= 6 && input.mouseY <= 46 && input.mouseX >= 482 && input.mouseX <= 526) {
          this.sound.toggleMute();
          input.clearTransientInputs();
          break;
        }

        // ★ 上下キーで START ⇔ 難易度 ⇔ ステージ の行を行き来
        if (input.justRotate || input.justDrop) {
          const rows = GameManager.TITLE_ROWS;
          const i = rows.indexOf(this.titleMenuSelection);
          this.titleMenuSelection = input.justRotate
            ? rows[(i - 1 + rows.length) % rows.length]
            : rows[(i + 1) % rows.length];
          this.sound.playHit();
        }

        // 左右キー：選択中の行の値を変更（難易度 or ステージ）
        if ((input.justLeft || input.justRight) && this.titleMenuSelection !== 'START') {
          if (this.titleMenuSelection === 'DIFFICULTY') {
            const list = GameManager.DIFFICULTIES;
            const i = list.indexOf(this.difficulty);
            this.difficulty = input.justLeft
              ? list[(i - 1 + list.length) % list.length]
              : list[(i + 1) % list.length];
          } else if (input.justLeft) {
            this.selectedStage = this.selectedStage > 1 ? this.selectedStage - 1 : 10;
          } else {
            this.selectedStage = this.selectedStage < 10 ? this.selectedStage + 1 : 1;
          }
          this.sound.playHit();
        }

        // 難易度切り替えタップ判定（難易度の行だけ）
        const rowTop = GameManager.TITLE_ROW_Y;
        const rowH = GameManager.TITLE_ROW_H;
        if (input.justMouseDown && input.mouseY !== null &&
            input.mouseY >= rowTop.DIFFICULTY && input.mouseY <= rowTop.DIFFICULTY + rowH.DIFFICULTY) {
          this.titleMenuSelection = 'DIFFICULTY';
          if (input.mouseX !== null) {
            // 画面を3分割：左=EASY／中=NORMAL／右=HARD
            this.difficulty = input.mouseX < CANVAS_WIDTH / 3
              ? 'EASY'
              : (input.mouseX < (CANVAS_WIDTH * 2) / 3 ? 'NORMAL' : 'HARD');
          } else {
            const list = GameManager.DIFFICULTIES;
            this.difficulty = list[(list.indexOf(this.difficulty) + 1) % list.length];
          }
          this.sound.playHit();
          break;
        }

        // 面セレクト切り替えタップ判定（ステージの行だけ）
        if (input.justMouseDown && input.mouseY !== null &&
            input.mouseY >= rowTop.STAGE && input.mouseY <= rowTop.STAGE + rowH.STAGE) {
          this.titleMenuSelection = 'STAGE';
          if (input.mouseX !== null) {
            if (input.mouseX < CANVAS_WIDTH / 2) {
              this.selectedStage = this.selectedStage > 1 ? this.selectedStage - 1 : 10;
            } else {
              this.selectedStage = this.selectedStage < 10 ? this.selectedStage + 1 : 1;
            }
          } else {
            this.selectedStage = this.selectedStage < 10 ? this.selectedStage + 1 : 1;
          }
          this.sound.playHit();
          break;
        }

        // ★ ユーザー要望：ゲーム開始は「単発Space／Enter」または
        //   「難易度の行とステージセレクトの行以外のどこか」をタップ。
        //   （難易度／ステージの行は上の分岐で break 済みなので、ここへは来ない）
        if (input.justShoot || input.justEnter || input.justMouseDown) {
          this.startNewGame();
        }
        break;

      case 'PLAYING':
        this.updatePlaying(dt, input);
        break;

      case 'PAUSED':
        // ★ ユーザー要望：「STAGE n を開始」行を選んでいる時だけ左右キーでSTAGE切り替え (1〜10)
        if (this.pauseMenuSelection === 'RESTART_STAGE') {
          if (input.justLeft) {
            this.selectedStage = this.selectedStage > 1 ? this.selectedStage - 1 : 10;
            this.sound.playHit();
          } else if (input.justRight) {
            this.selectedStage = this.selectedStage < 10 ? this.selectedStage + 1 : 1;
            this.sound.playHit();
          }
        }

        // 上下キーまたはW/Sキーで選択切り替え
        if (input.justRotate) {
          if (this.pauseMenuSelection === 'RESUME') this.pauseMenuSelection = 'TITLE';
          else if (this.pauseMenuSelection === 'RESTART_STAGE') this.pauseMenuSelection = 'RESUME';
          else if (this.pauseMenuSelection === 'TITLE') this.pauseMenuSelection = 'RESTART_STAGE';
          this.sound.playHit();
        } else if (input.justDrop) {
          if (this.pauseMenuSelection === 'RESUME') this.pauseMenuSelection = 'RESTART_STAGE';
          else if (this.pauseMenuSelection === 'RESTART_STAGE') this.pauseMenuSelection = 'TITLE';
          else if (this.pauseMenuSelection === 'TITLE') this.pauseMenuSelection = 'RESUME';
          this.sound.playHit();
        }

        // マウス位置での選択
        if (input.mouseY !== null) {
          if (input.mouseY >= 395 && input.mouseY <= 440) {
            this.pauseMenuSelection = 'RESUME';
          } else if (input.mouseY >= 445 && input.mouseY <= 490) {
            this.pauseMenuSelection = 'RESTART_STAGE';
          } else if (input.mouseY >= 495 && input.mouseY <= 540) {
            this.pauseMenuSelection = 'TITLE';
          }
        }

        // 「STAGE n を開始」行の左右端（◀ / ▶）タップでSTAGE切り替え（中央タップは決定）
        if (input.justMouseDown && input.mouseX !== null && input.mouseY !== null && input.mouseY >= 445 && input.mouseY <= 490) {
          const edge = 90;
          if (input.mouseX < edge || input.mouseX > CANVAS_WIDTH - edge) {
            this.pauseMenuSelection = 'RESTART_STAGE';
            if (input.mouseX < edge) {
              this.selectedStage = this.selectedStage > 1 ? this.selectedStage - 1 : 10;
            } else {
              this.selectedStage = this.selectedStage < 10 ? this.selectedStage + 1 : 1;
            }
            this.sound.playHit();
            input.clearTransientInputs();
            break;
          }
        }

        // スペースキー、Enterキー、またはマウスクリックで決定（単発押し判定）
        if (input.justShoot || input.justEnter || (input.justMouseDown && input.mouseY !== null && input.mouseY >= 395 && input.mouseY <= 545)) {
          this.handlePauseConfirm(input);
        }

        // 無敵モードのタップ切替（PAUSE画面で Y: 550..585 をタップ）
        if (input.justMouseDown && input.mouseY !== null && input.mouseY >= 550 && input.mouseY <= 585) {
          this.isInvincibleMode = !this.isInvincibleMode;
          this.player.isInvincible = this.isInvincibleMode;
          this.sound.playDock();
          input.clearTransientInputs();
        }
        break;

      case 'STAGE_CLEAR':
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          if (this.stage >= MAX_STAGES) {
            this.state = 'VICTORY';
            // ★ ユーザー要望：クリア画面で専用mp3（public/audio/game_clear.mp3）を流す
            this.sound.playClearMusic();
          } else {
            this.stage++;
            this.state = 'PLAYING';
            this.startTetrisPhase();
          }
        }
        break;

      case 'GAMEOVER':
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          // 上下キーまたはW/Sキーで選択項目をトグル
          if (input.justRotate || input.justDrop) {
            this.gameOverSelection = this.gameOverSelection === 'CONTINUE' ? 'TITLE' : 'CONTINUE';
            this.sound.playHit();
          }

          // マウスクリック／タップでの選択＆決定
          // （タップ直後に pointercancel が来る環境があるため justMouseDown も見る）
          if ((input.isMouseDown || input.justMouseDown) && input.mouseY !== null) {
            if (input.mouseY >= 450 && input.mouseY <= 505) {
              this.gameOverSelection = 'CONTINUE';
              this.handleGameOverConfirm();
              break;
            } else if (input.mouseY >= 515 && input.mouseY <= 570) {
              this.gameOverSelection = 'TITLE';
              this.handleGameOverConfirm();
              break;
            }
          }

          // スペースキーまたはEnterキーで決定
          if (input.shoot || input.justEnter) {
            this.handleGameOverConfirm();
          }
        }
        break;

      case 'VICTORY':
        this.stateTimer -= dt;
        // ★ ユーザー要望：クリア画面でボタンを押したらステージ1を始めるのではなく、タイトルに戻る
        if (this.stateTimer <= 0 && (input.justShoot || input.justEnter || input.justMouseDown)) {
          this.sound.stopClearMusic();
          this.returnToTitle();
          input.clearTransientInputs();
        }
        break;
    }
  }

  private updatePlaying(dt: number, input: Input): void {
    if (this.screenShake > 0) {
      this.screenShake = Math.max(0, this.screenShake - dt * 14);
    }

    if (this.phase === 'TETRIS') {
      this.updateTetrisPhase(dt, input);
    } else {
      // 80年代アーケード快感演出：マイクロ・ヒットストップ（1〜2フレームの物理停止で弾の重み・衝撃を演出）
      if (this.hitStopTimer > 0) {
        this.hitStopTimer -= dt;
        return;
      }

      this.applyClickOnlyControls(dt, input);
    this.player.updateMovement(dt, this.movementInput(input));
      this.updateShootingPhase(dt, input);
    }

    if (this.player.isDead) {
      if (!this.playerDeathSoundPlayed) {
        this.playerDeathSoundPlayed = true;
        this.lastDeathPopTime = -1;
        this.sound.stopBGM();
        this.sound.stopBossLfo();
        this.sound.stopBossWarning();
        this.sound.playPlayerDeath();
        this.screenShake = 22;
        const px = this.player.anchorX + BLOCK_SIZE;
        const py = this.player.anchorY + BLOCK_SIZE;
        this.particles.emitRetroExplosion(px, py, 3.5);
      }
      this.deathDelay += dt;
      // プレイヤー死亡演出：時間差で自機位置に連続誘爆・破片火花を放出
      // ★ ユーザー要望：死亡音が大きく長すぎた（毎フレーム約35%で爆発音が重なっていた）ので、
      //   爆発音は0.35秒間隔・最初の1.2秒だけに制限。粒子は従来どおり
      if (Math.random() < 0.35) {
        const px = this.player.anchorX + BLOCK_SIZE + (Math.random() - 0.5) * 40;
        const py = this.player.anchorY + BLOCK_SIZE + (Math.random() - 0.5) * 40;
        this.particles.emitExplosion(px, py, Math.random() > 0.5 ? '#ff2200' : '#ffea00', 16, true);
      }
      if (this.deathDelay < 1.2 && this.deathDelay - this.lastDeathPopTime >= 0.35) {
        this.lastDeathPopTime = this.deathDelay;
        this.sound.playEnemyPop();
      }
      if (this.deathDelay >= 2.2) {
        this.triggerGameOver();
      }
    }
  }

  // ==========================================
  // パズルフェーズ（1個降下：集中してドッキング！）
  // ==========================================
  private spawnTetrominoes(): void {
    // ★ ユーザー要望：「oミノは、決して落ちてこない、でいいよ。つかえないから。最初のだけoミノってことで。」
    // 降下テトリミノからOミノを完全に排除し、砲門・翼・拡張パーツとして機能する6種（I, J, L, S, T, Z）のみを投下
    const types: TetrominoType[] = ['I', 'J', 'L', 'S', 'T', 'Z'];
    this.fallingPieces = [];

    // 画面上部から緩やかに斜めドリフト降下
    const type = types[Math.floor(Math.random() * types.length)];
    const piece = new TetrominoPiece(type);

    const r = Math.floor(Math.random() * 4);
    for (let k = 0; k < r; k++) piece.rotate();

    const startX = CANVAS_WIDTH / 2 - BLOCK_SIZE;
    const startY = 40;

    this.fallingPieces.push({
      index: 0,
      piece,
      x: startX,
      y: startY,
      vx: (Math.random() > 0.5 ? 1 : -1) * 35, // 緩やかな左右ドリフト
      vy: 55, // ★ ユーザー要望：降下速度の初期値を約3割アップ（42→55）
      gx: Math.round(startX / BLOCK_SIZE),
      gy: Math.round(startY / BLOCK_SIZE),
      fallTimer: 0,
      settled: false,
    });

    this.activePieceIndex = 0;
  }

  private updateTetrisPhase(dt: number, input: Input): void {
    // ★ ユーザー要望：ドッキングせよ 30.0から減っていく、とらないまま0になったらしゅわーときえていくミノ
    this.dockingTimer = Math.max(0, this.dockingTimer - dt);
    if (this.dockingTimer <= 0) {
      for (const item of this.fallingPieces) {
        if (!item.settled) {
          item.settled = true;
          this.particles.emitDissolve(item.x, item.y, BLOCK_SIZE * 3, BLOCK_SIZE * 2, item.piece.color, 45);
          this.sound.playExplosion(false);
        }
      }
      this.startShootingPhase();
      return;
    }

    // ★ ユーザー要望：クリアの瞬間から次ステージ開始までバリアの残り時間を止める
    this.player.barrierFrozen = true;

    // 1. 自機の操作（エクセリオン風慣性移動）
    this.applyClickOnlyControls(dt, input);
    this.player.updateMovement(dt, this.movementInput(input));

    // ★ ドッキング中もオーブは流れ続け、取ればバリアが張れる（カウントは次ステージ開始から）
    this.updateFieldItems(dt);

    // 発射ロックアウト減算（ゲーム開始直後の誤射防止）
    if (this.fireLockout > 0) this.fireLockout -= dt;

    // 2. 自機ショット発射（弾を撃って落下中ミノに当てる！）
    // ★ justShoot も見る：iOS の一部環境では押した直後に pointercancel が来て
    //   同じフレーム内で shoot が降ろされてしまう。単発のタップでも必ず1発は出るようにする
    if ((input.shoot || input.isMouseDown || input.justShoot || this.clickFireTimer > 0) && this.player.fireCooldown <= 0 && this.fireLockout <= 0) {
      const newBullets = this.player.shootBullets(this.playerBullets);
      if (newBullets.length > 0) {
        this.playerBullets.push(...newBullets);
        // ★ ユーザー要望：発射した弾の数だけ音を鳴らす（同時発音数の上限は Sound 側で制御）
        this.sound.playShootVolley(newBullets.map(b => b.pieceType));
        this.player.fireCooldown = PLAYER_FIRE_INTERVAL;
      }
    }

    // 弾の更新
    for (let i = this.playerBullets.length - 1; i >= 0; i--) {
      const b = this.playerBullets[i];
      b.update(dt);
      if (b.isDead) {
        this.playerBullets.splice(i, 1);
      }
    }

    // 3. 落下中ミノの自律ドリフト移動＆弾との衝突回転・反動判定
    for (const item of this.fallingPieces) {
      if (item.settled) continue;

      item.fallTimer += dt;
      if (item.dockCooldown && item.dockCooldown > 0) {
        item.dockCooldown -= dt;
      }

      // ★ ユーザー要望：弾を当てるたびに落下速度・左右速度が上がる（1発ごとに+24%、最大4倍）
      const speedMul = Math.min(4.0, 1 + (item.hitCount || 0) * 0.24);

      // 重力加速度＆慣性落下ダイナミクス
      const GRAVITY = 140 * speedMul;
      const MAX_FALL_SPEED = 78 * speedMul; // ★ 60→78（約3割アップ）

      // 弾による打ち上げ・反動インパルスからの重力落下
      item.vy += GRAVITY * dt;
      if (item.vy > MAX_FALL_SPEED) {
        item.vy = MAX_FALL_SPEED;
      }

      // 横方向の自然なゆったりドリフト＋減衰
      item.vx *= (1 - 0.5 * dt);
      item.vx += Math.sin(item.fallTimer * 1.5) * 15 * speedMul * dt;

      // 移動適用
      item.x += item.vx * dt;
      item.y += item.vy * dt;

      // 画面左右端で反転バウンド
      if (item.x < 15) {
        item.x = 15;
        item.vx = Math.abs(item.vx) * 0.8;
      } else if (item.x > CANVAS_WIDTH - 15 - BLOCK_SIZE * 3) {
        item.x = CANVAS_WIDTH - 15 - BLOCK_SIZE * 3;
        item.vx = -Math.abs(item.vx) * 0.8;
      }

      item.gx = Math.round(item.x / BLOCK_SIZE);
      item.gy = Math.round(item.y / BLOCK_SIZE);

      // 弾 vs 落下中ミノの回転＆上反動判定！
      // ユーザー要望：球打つと一旦離れて飛ぶ / 少し上に反動で行ったりするといいな
      // ★ ユーザー要望（スマホ）：タッチ操作では弾でミノを回転・ノックバックさせない。
      //   代わりにミノを直接タップして回す（tryTouchRotatePiece 参照）。
      //   弾は当たり判定ごと素通りさせ、自機の弾がミノに吸われないようにする。
      const pieceBounds = item.piece.getBoundingBox(item.x, item.y);
      const pieceCenterX = (pieceBounds.minX + pieceBounds.maxX) / 2;
      const bulletsRotate = !(this.lastInput && this.lastInput.touchMode);

      for (let bi = bulletsRotate ? this.playerBullets.length - 1 : -1; bi >= 0; bi--) {
        const pb = this.playerBullets[bi];
        if (pb.isDead) continue;

        if (
          pb.x >= pieceBounds.minX - 4 &&
          pb.x <= pieceBounds.maxX + 4 &&
          pb.y >= pieceBounds.minY - 4 &&
          pb.y <= pieceBounds.maxY + 4
        ) {
          pb.isDead = true;
          this.particles.emitSparks(pb.x, pb.y, item.piece.color, 12);
          this.sound.playHit();

          // ★ 当てるたびにカウントを増やし、反動・ノックバックも少しずつ強く
          item.hitCount = (item.hitCount || 0) + 1;
          const hitMul = Math.min(4.0, 1 + item.hitCount * 0.24);

          // 1. 上方向への力強い反動インパルス（お手玉・浮遊）
          item.vy = -130 * hitMul;

          // 2. ショット位置に応じた回転と左右ノックバック
          const hitOffset = pb.x - pieceCenterX;
          if (hitOffset < -6) {
            item.piece.rotate(); // 左側ヒット：時計回り（右回転）
            item.vx = Math.min(item.vx + 45 * hitMul, 90 * hitMul);
          } else if (hitOffset > 6) {
            item.piece.rotateCounter(); // 右側ヒット：反時計回り（左回転）
            item.vx = Math.max(item.vx - 45 * hitMul, -90 * hitMul);
          } else {
            // ど真ん中ヒット：真上に大ジャンプ！
            item.vy = -165 * hitMul;
          }

          // 3. 撃った直後は合体不可（0.4秒間ドッキング判定をオフにし、誤合体を防止）
          item.dockCooldown = 0.4;
        }
      }

      // 4. 自機との接触・近接スナップ合体判定！
      // 降下中（vy > 0）かつショット直後の反動中でない場合のみドッキング受付
      const canDockNow = (!item.dockCooldown || item.dockCooldown <= 0) && item.vy > 0;
      const playerBounds = this.player.getBoundingBox();
      const isClose =
        pieceBounds.maxX >= playerBounds.minX - 25 &&
        pieceBounds.minX <= playerBounds.maxX + 25 &&
        pieceBounds.maxY >= playerBounds.minY - 30 &&
        pieceBounds.minY <= playerBounds.maxY + 15;

      if (canDockNow && isClose) {
        // 自機と最も距離が近く、接合面が合致する最適グリッド位置にスナップ合体
        const dockRes = this.player.tryDockFromPixel(item.piece, item.x, item.y, BLOCK_SIZE * 1.15);
        if (dockRes.docked) {
          item.settled = true;
          this.sound.playDock(); // ムーンクレスタ風ピロピロピロ！
          this.particles.emitDockRing(item.x + BLOCK_SIZE, item.y + BLOCK_SIZE, item.piece.color);
          this.score += 500;
          break;
        }
      }

      // 底まで落ちてしまった場合
      if (item.y > CANVAS_HEIGHT - 30) {
        item.settled = true;
        this.sound.playExplosion(false);
        this.particles.emitExplosion(item.x + BLOCK_SIZE, item.y, item.piece.color, 16);
      }
    }

    const remaining = this.fallingPieces.filter(p => !p.settled).length;
    this.remainingPiecesCount = remaining;

    // ドッキング終了したら即座にバトルへ突入！
    if (remaining === 0) {
      this.startShootingPhase();
    }
  }

  // ==========================================
  // シューティングフェーズ：ウェーブごとの鮮やかな個性＆レベルデザイン！
  // 面が進むごとに敵の数・方向・攻撃頻度が怒涛のように進化！
  // ==========================================
  // ★ ユーザー要望：HARD はザコの数を全ステージ一律で5割増（NORMAL の数 × 1.5、切り上げ）
  //   EASY は全ステージ一律で 2/3（四捨五入。1機以上は必ず残す）
  private hc(normalCount: number): number {
    if (this.difficulty === 'HARD') return Math.ceil(normalCount * 1.5);
    if (this.difficulty === 'EASY') return Math.max(1, Math.round((normalCount * 2) / 3));
    return normalCount;
  }

  private spawnAlienFleet(): void {
    this.enemies = [];

    // ★ ユーザー要望：ドッキングして即死ぬ時がある。ムーンクレスタのようにstage1とか出したあと、ちょっとして敵を出す
    // ドッキング直後に敵が自機に体当たりして即死するのを防ぐため、開幕に1.5秒のセーフティディレイを設ける
    const START_DELAY = 1.5;

    switch (this.stage) {
      case 1:
        // 【WAVE 1：ムーンクレスタ Stage 1&2・コールドアイ＆スーパーアイ（純粋なムーンクレスタ面）】
        // ユーザー要望：基本は一種類の敵を出す。順番に別の種類の敵が出る
        // フェーズ1（t=1.5〜）：コールドアイ4機（上部スイングから階段状ダイブ、撃破で2つに分裂）
        // 点が生まれて拡大するムーンクレスタ1面風の演出で実体化！
        for (let i = 0; i < this.hc(4); i++) {
          this.enemies.push(new Enemy('SPLITTING_EYE', 'MOON_COLD_EYE', i, 0, START_DELAY));
        }
        // フェーズ2（t=10.5〜）：増援コールドアイ4機（上空から滑空して編隊形成）
        for (let i = 0; i < this.hc(4); i++) {
          this.enemies.push(new Enemy('SPLITTING_EYE', 'MOON_COLD_EYE', i, 0, START_DELAY + 9.0));
        }
        // フェーズ3（t=18.5〜）：スーパーアイ8機（左右壁面バウンドの電光石火ダイブ）
        for (let i = 0; i < this.hc(8); i++) {
          this.enemies.push(new Enemy('MINI_EYE', 'MOON_SUPER_EYE', i, 0, START_DELAY + 17.0 + i * 0.4));
        }
        break;

      case 2:
        // 【STAGE 2：純粋なギャラガ大旋回面（グルングルン回る高速編隊＆画面全体スウィング）】
        // ユーザー要望：2面ってギャラガモチーフじゃなかったっけ？ もっとグルングルン回るよね編隊、画面全体使って、それなりの速度で。したまでくる！
        // ウェーブ1（t=1.5〜）：左から大S字ループで下部(y≈620)まで急降下旋回するグリーン・ドローン隊（8機）
        for (let k = 0; k < this.hc(8); k++) {
          this.enemies.push(new Enemy('GREEN_DRONE', 'STREAM_CURVE', 1 + (k % 4), 2, START_DELAY, 'S_CURVE_LEFT_TO_RIGHT', k));
        }
        // ウェーブ2（t=6.5〜）：右から大S字ループで逆から画面全体を横断・下部スウィングするレッド・ガード隊（8機）
        for (let k = 0; k < this.hc(8); k++) {
          this.enemies.push(new Enemy('RED_GUARD', 'STREAM_CURVE', 4 + (k % 4), 1, START_DELAY + 5.0, 'S_CURVE_RIGHT_TO_LEFT', k));
        }
        // ウェーブ3（t=12.0〜）：左右から同時に突入し中央で8の字インフィニティループを描く交差編隊！
        for (let k = 0; k < this.hc(8); k++) {
          this.enemies.push(new Enemy('GREEN_DRONE', 'STREAM_CURVE', 2 + (k % 4), 3, START_DELAY + 10.5, 'INFINITY_DIVE_LEFT', k));
          this.enemies.push(new Enemy('RED_GUARD', 'STREAM_CURVE', 3 + (k % 4), 3, START_DELAY + 10.5, 'INFINITY_DIVE_RIGHT', k));
        }
        // ウェーブ4：巨大8の字大旋回ループで画面を舞うイエロー司令機＆護衛隊！
        // ★ ユーザー要望：ボス前の超高速8の字は1回だけだと物足りないので3回出す
        // ★ ユーザー要望（追加）：速すぎるので減速（streamSpeedScale 0.7）。
        //   動きはもっと大回りに（Enemy の FIGURE_EIGHT 参照。左右とも画面外へ少しはみ出す）。
        //   出る間隔が空きすぎなので半分に（4.5秒 → 2.25秒間隔）。
        //   間隔を詰めると複数編隊が同時に舞うので、編隊ごとに curveRouteIndex を変えて
        //   ルート（高さ帯）が重ならないようにしてある。
        {
          const F8_WAVES = [17.0, 19.25, 21.5];
          F8_WAVES.forEach((waveAt, wi) => {
            for (let k = 0; k < this.hc(6); k++) {
              const e = new Enemy('YELLOW_COMMANDER', 'STREAM_CURVE', 3 + (k % 3), 0, START_DELAY + waveAt, 'FIGURE_EIGHT', k);
              e.curveRouteIndex = wi;
              e.streamSpeedScale = 0.7;
              this.enemies.push(e);
            }
          });
        }
        break;

      case 3:
        // 【STAGE 3：スターフォース名物「ガリ」＆ 90度直角旋回機 ＆ 左右ワープランナー】
        // ユーザー要望：敵を混ぜずに順番に出す
        // フェーズ1（t=1.5〜）：スターフォース「ガリ」第一波（深く急降下→急停止スウィング→超高速ダッシュ）
        for (let i = 0; i < this.hc(10); i++) {
          this.enemies.push(new Enemy('STARFORCE_GARI', 'STARFORCE_GARI_MOVE', 1 + (i % 6), 0, START_DELAY + i * 0.4));
        }
        // ★ ユーザー要望：3面は地形もあり難しいので、敵種が混ざらないよう各フェーズの間隔を大きく広げて一種類ずつ出す
        // フェーズ2（t=13.5〜）：左右ループ走査機（画面端から反対端へループワープする巡航機）
        for (let i = 0; i < this.hc(8); i++) {
          this.enemies.push(new Enemy('SIDE_WARP_RUNNER', 'SIDE_WRAP_SWEEP', i % 2 === 0 ? 0 : 7, i % 3, START_DELAY + 12.0 + i * 0.35));
        }
        // フェーズ3（t=24.0〜）：左右端落下→自機Yで90度直角旋回突進！
        for (let i = 0; i < this.hc(8); i++) {
          this.enemies.push(new Enemy('STARFORCE_CORNER', 'STARFORCE_CORNER_DIVE', i, 0, START_DELAY + 22.5 + i * 0.38));
        }
        // ★ ユーザー要望：3面に「画面下から出てくる敵」を追加。
        //   フェーズの切れ目（比較的敵の出ていない時間帯）に挟み、
        //   上ばかり見ていると足元から刺される緊張感を作る。
        //   SURPRISE_FROM_BOTTOM は画面下端から急上昇して編隊に加わるパターン
        for (let i = 0; i < this.hc(4); i++) {
          this.enemies.push(new Enemy('TOROID_SCOUT', 'SURPRISE_FROM_BOTTOM', 1 + i * 2, 0, START_DELAY + 8.0 + i * 0.5));
        }
        for (let i = 0; i < this.hc(4); i++) {
          this.enemies.push(new Enemy('TOROID_SCOUT', 'SURPRISE_FROM_BOTTOM', 2 + i * 2, 0, START_DELAY + 18.5 + i * 0.5));
        }
        break;

      case 4:
        // 【STAGE 4：索敵急加速ミサイル ＆ フォー・フライ ＆ 広域ギャラガ大旋回】
        // 地形スクロールのない宇宙空間で、ギャラガ編隊が縦横無尽に画面全体を舞う！
        // フェーズ1（t=1.5〜）：索敵急加速ミサイル（フワリと横移動後、突如バーニア点火で急加速）
        for (let i = 0; i < this.hc(10); i++) {
          this.enemies.push(new Enemy('DART_MISSILE', 'DELAYED_DART', 1 + (i % 6), 0, START_DELAY + i * 0.35));
        }
        // フェーズ2（t=7.5〜）：オープン空間を縦横無尽に飛び回るギャラガ交差ストリーム編隊！
        for (let k = 0; k < this.hc(12); k++) {
          this.enemies.push(new Enemy('GREEN_DRONE', 'STREAM_CURVE', 2 + (k % 4), 2, START_DELAY + 6.0, 'INFINITY_DIVE_LEFT', k));
          this.enemies.push(new Enemy('RED_GUARD', 'STREAM_CURVE', 3 + (k % 4), 2, START_DELAY + 6.0, 'INFINITY_DIVE_RIGHT', k));
        }
        // フェーズ3（t=14.0〜）：ムーンクレスタ名物「フォー・フライ」（カミソリ急降下ジグザグ）
        // ★ ユーザー要望：ただ上から降りてくるだけだと弱いので、
        //   「上→下」「左→右」「右→左」「下→上」の4方向の出方を用意し、
        //   ボスの前に4種類すべてを出す（動き方＝ジグザグ自体は共通）
        {
          // ★ ユーザー要望：左から・右から・下からの波は数が少なく感じるので増やす
          //   （上からの波は元の数のまま）
          const flyWaves: { dir: 'DOWN' | 'RIGHT' | 'LEFT' | 'UP'; at: number; n: number }[] = [
            { dir: 'DOWN', at: 12.5, n: 6 },
            { dir: 'RIGHT', at: 16.5, n: 10 },
            { dir: 'LEFT', at: 20.5, n: 10 },
            { dir: 'UP', at: 24.5, n: 10 },
          ];
          for (const w of flyWaves) {
            for (let i = 0; i < this.hc(w.n); i++) {
              const e = new Enemy('FOUR_FLY', 'ZIGZAG_DIVE', 1 + (i % 8), 1 + (i % 6), START_DELAY + w.at + i * 0.3);
              e.zigzagDir = w.dir;
              this.enemies.push(e);
            }
          }
        }
        break;

      case 5:
        // 【STAGE 5：ドラマチック起承転結ステージ（静寂 → スリル → クライマックス大群 → UFO母船ボス）】
        // ユーザー要望：5面とかただやみくもに複数の敵をたくさん出してるだけじゃない？ まず面の最初からたくさん出すなよ
        // 1面の中でも静かに始まって、ところどころスリルのあるところがあって、ものすごくてきがたくさん！みたいなクライマックスがあって、その後ボス！
        //
        // ★ ユーザー要望：Stage 5 は地形に非常にぶつかりやすく難しいので、出現敵を約半分に削減
        // ★ ユーザー要望：5面のザコは地形（壁際から発射される地表ミサイル）だけ。スクリプト出現の敵は無し
        //   （開始10秒間は壁の発射も止めているので、最初は地形のみ）
        //
        // ★ ユーザー要望（追加）：「5面の敵が少し少ないのでミサイルの量を倍に。
        //   あと少しだけ、3面で出てくる “縦座標が合うと90度角度を変えて自機に向かってくる敵” を入れて。
        //   ミサイルとその敵は重ならないように配分」
        //   → ミサイルは siloSpacing を半分にして倍増（startShootingPhase 参照）。
        //     直角旋回機はミサイルを完全に止めた「静粛時間帯」にだけ出す（STAGE5_CORNER_WAVES）。
        //     倒し遅れて時間帯をまたぐ被りは許容。
        for (const wave of STAGE5_CORNER_WAVES) {
          for (let i = 0; i < this.hc(STAGE5_CORNER_PER_WAVE); i++) {
            // formationCol の偶奇で左右の落下位置が決まるので、左右交互に降らせる
            this.enemies.push(new Enemy('STARFORCE_CORNER', 'STARFORCE_CORNER_DIVE', i, 0, wave.spawnAt + i * STAGE5_CORNER_SPAWN_STEP));
          }
        }
        break;

      case 6:
        // 【WAVE 6：沙羅曼蛇 2・横スクロール 右方向バンガード岩盤回廊】（ザコ52機）
        // 天井と床から突き出るバンガードブロック岩！ガリの急襲＋索敵加速ミサイル＋トーロイド！
        for (let i = 0; i < this.hc(14); i++) {
          this.enemies.push(new Enemy('STARFORCE_GARI', 'STARFORCE_GARI_MOVE', 1 + (i % 6), 0, 0.2 + i * 0.25));
        }
        for (let i = 0; i < this.hc(12); i++) {
          this.enemies.push(new Enemy('DART_MISSILE', 'DELAYED_DART', 1 + (i % 5), 0, 0.8 + i * 0.22));
        }
        for (let i = 0; i < this.hc(14); i++) {
          this.enemies.push(new Enemy('TOROID_SCOUT', 'XEVIOUS_TOROID', 1 + (i % 6), 1, 1.4 + i * 0.2));
        }
        for (let i = 0; i < this.hc(10); i++) {
          this.enemies.push(new Enemy('TERRAIN_MISSILE', 'TERRAIN_LAUNCH', 1 + (i % 5), 0, 2.0 + i * 0.18));
        }
        break;

      case 7:
        // 【WAVE 7：アトミック・ファントム＆ベータ・ファントム（個性重視・フェーズ制）】
        // ★ ユーザー要望：一気に大量に出すだけではなく個性を。ガリは外し、敵ごとに固有の動きで順番に出す
        //   （全ステージ共通の開幕1.5秒シフト後の時刻）
        // 1. アトミック・ファントム：3機ずつのトリオが上部で静止→震え→自機へ鋭角急加速突撃（t≈1.5〜12）
        {
          const trios = this.hc(3);
          for (let w = 0; w < trios; w++) {
            for (let k = 0; k < 3; k++) {
              this.enemies.push(new Enemy('ATOMIC_PHANTOM', 'ATOMIC_CHARGE', 2 + k * 2, 0, 0.0 + w * 3.5 + k * 0.45));
            }
          }
          // 2. ベータ・ファントム：左右から交互に横スイープ、自機の真上で翼を畳んで垂直ダイブ（t≈13〜21）
          const betas = this.hc(7);
          for (let i = 0; i < betas; i++) {
            this.enemies.push(new Enemy('BETA_PHANTOM', 'BETA_WING_SWEEP', i, i, 11.5 + i * 1.2));
          }
          // 3. メテオの嵐：斜めメテオが4秒間だけ集中して降り注ぐ（t≈22〜26）
          const meteors = this.hc(12);
          for (let i = 0; i < meteors; i++) {
            this.enemies.push(new Enemy('METEOR_ROCK', 'METEOR_DIAGONAL', 1 + (i % 8), 0, 20.5 + i * 0.3));
          }
          // 4. フィナーレ：アトミック＆ベータの混成（t≈27〜31）→ ボス
          for (let k = 0; k < this.hc(4); k++) {
            this.enemies.push(new Enemy('ATOMIC_PHANTOM', 'ATOMIC_CHARGE', 1 + k * 2, 0, 25.5 + k * 0.5));
          }
          for (let i = 0; i < this.hc(3); i++) {
            this.enemies.push(new Enemy('BETA_PHANTOM', 'BETA_WING_SWEEP', i, i + 1, 26.0 + i * 1.3));
          }
        }
        break;

      case 8:
        // 【WAVE 8：左スクロール・バンガード岩盤回廊 ＋ ギャラガ・総力大編隊（インフィニティ大乱舞＆四方包囲）】
        // ★ ユーザー要望：Stage 8 は地形のある左スクロール面（Stage 6 の反対方向）
        // ★ ユーザー要望：最初に一度に出すぎるので、4グループをそれぞれずらして出現させ、
        //   総数も従来（78機）の約2/3（52機）に削減（2秒間隔だとHARDでまだ3種類が重なるとのことで3秒に拡大）
        // ★ ユーザー要望（追加）：それでも複数種が最初から混ざって大変なので、
        //   次の敵軍が来るまでの間隔をさらに1.5倍に（約3.04秒 → 約4.55秒間隔）。
        //   各グループ内の1機ごとの間隔は変えていない（グループの塊としての密度は従来どおり）
        {
          const G = [0.12, 4.67, 9.23, 13.78]; // 各グループの出現開始時刻（間隔 ≒ 4.55秒）
          for (let k = 0; k < this.hc(13); k++) {
            this.enemies.push(new Enemy('GREEN_DRONE', 'STREAM_CURVE', 1 + (k % 5), 3, G[0], 'INFINITY_DIVE_LEFT', k));
            this.enemies.push(new Enemy('RED_GUARD', 'STREAM_CURVE', 4 + (k % 5), 3, G[0], 'INFINITY_DIVE_RIGHT', k));
          }
          for (let i = 0; i < this.hc(9); i++) {
            this.enemies.push(new Enemy('GRADIUS_FAN', 'GRADIUS_FLEET', 1 + (i % 6), 0, G[1] + i * 0.18));
          }
          for (let i = 0; i < this.hc(9); i++) {
            this.enemies.push(new Enemy('DART_MISSILE', 'DELAYED_DART', 1 + (i % 6), 0, G[2] + i * 0.16));
          }
          for (let i = 0; i < this.hc(7); i++) {
            this.enemies.push(new Enemy('FAST_FLYBY', 'FLYBY_CROSS', 1 + (i % 5), 0, G[3] + i * 0.15));
          }
        }
        break;

      case 9:
        // 【WAVE 9：極限バンガード迷宮要塞】
        // ★ ユーザー要望：敵は必ず一種ずつ順番に（倒し遅れて次と混ざる程度はOK）。総数はそのまま、
        //   まとめて出すのを遅らせて面を長くする（バトル時間 100 秒、ボスは約68秒）
        //   （開幕10秒は敵なし → 以下は +10 秒シフト後の実時間）
        // 1. ガリ 12機（t=10〜15）
        for (let i = 0; i < this.hc(12); i++) {
          this.enemies.push(new Enemy('STARFORCE_GARI', 'STARFORCE_GARI_MOVE', 1 + (i % 6), 0, 0.0 + i * 0.45));
        }
        // 2. 索敵ミサイル 10機（t=20〜24）
        for (let i = 0; i < this.hc(10); i++) {
          this.enemies.push(new Enemy('DART_MISSILE', 'DELAYED_DART', 1 + (i % 6), 0, 10.0 + i * 0.45));
        }
        // 3. トーロイド 10機（t=29〜33）
        for (let i = 0; i < this.hc(10); i++) {
          this.enemies.push(new Enemy('TOROID_SCOUT', 'XEVIOUS_TOROID', 1 + (i % 7), 1, 19.0 + i * 0.4));
        }
        // 4. ガリ第2波 8機（t=38〜42）
        for (let i = 0; i < this.hc(8); i++) {
          this.enemies.push(new Enemy('STARFORCE_GARI', 'STARFORCE_GARI_MOVE', 1 + (i % 6), 0, 28.0 + i * 0.5));
        }
        // 5. 索敵ミサイル第2波 8機（t=46〜50）
        for (let i = 0; i < this.hc(8); i++) {
          this.enemies.push(new Enemy('DART_MISSILE', 'DELAYED_DART', 1 + ((i + 3) % 6), 0, 36.0 + i * 0.5));
        }
        // 6. トーロイド第2波 8機（t=54〜57）
        for (let i = 0; i < this.hc(8); i++) {
          this.enemies.push(new Enemy('TOROID_SCOUT', 'XEVIOUS_TOROID', 1 + (i % 7), 1, 44.0 + i * 0.45));
        }
        // 7. ロケット 8機（t=60〜64）→ ボス（約68秒）
        for (let i = 0; i < this.hc(8); i++) {
          this.enemies.push(new Enemy('TERRAIN_MISSILE', 'TERRAIN_LAUNCH', 1 + (i % 6), 0, 50.0 + i * 0.5));
        }
        break;

      case 10:
      default:
        // 【WAVE 10：最終決戦・オールスター総力戦カタストロフィ】（ザコ90機超え！）
        // ムーンクレスタ怪獣・スターフォース・グラディウス・沙羅曼蛇が総結集する究極のラストバトル！
        for (let i = 0; i < this.hc(16); i++) {
          this.enemies.push(new Enemy('STARFORCE_GARI', 'STARFORCE_GARI_MOVE', 1 + (i % 6), 0, 0.1 + i * 0.14));
        }
        for (let i = 0; i < this.hc(14); i++) {
          this.enemies.push(new Enemy('GRADIUS_FAN', 'GRADIUS_FLEET', 1 + (i % 6), 0, 0.4 + i * 0.16));
        }
        for (let i = 0; i < this.hc(16); i++) {
          this.enemies.push(new Enemy('DART_MISSILE', 'DELAYED_DART', 1 + (i % 6), 0, 0.7 + i * 0.14));
        }
        for (let i = 0; i < this.hc(18); i++) {
          this.enemies.push(new Enemy('BETA_PHANTOM', 'MOON_SPLIT_FLOAT', 1 + (i % 7), 0, 1.0 + i * 0.12));
        }
        for (let i = 0; i < this.hc(16); i++) {
          this.enemies.push(new Enemy('METEOR_ROCK', 'METEOR_DIAGONAL', 1 + (i % 8), 0, 1.4 + i * 0.1));
        }
        break;
    }

    // ★ ユーザー要望：面の最初、ドッキング直後に即死しないよう全ステージ共通で開幕セーフティ時間を保証
    // （Stage 6〜10 は個別ディレイが 0.1〜2.2 秒と短かったため、一律 START_DELAY 分だけ後ろ倒し）
    if (this.stage >= 6) {
      // ★ ユーザー要望：9面は難しいので最初の10秒は敵を出さない（他は1.5秒）
      const extraDelay = this.stage === 9 ? 10.0 : START_DELAY;
      for (const e of this.enemies) {
        e.delaySpawn(extraDelay);
      }
    }

    // ★ ユーザー要望：mp3 ステージBGMがある版では、ドッキング完了で曲が鳴り始めてから3秒待って敵を出す
    if (this.sound.hasStageMusic()) {
      const MUSIC_INTRO = 3.0;
      for (const e of this.enemies) {
        e.delaySpawn(MUSIC_INTRO);
      }
      this.terrain.siloStartDelay += MUSIC_INTRO;
      // 敵を後ろ倒しした分、ミサイルの静粛時間帯も同じだけずらす（担当時間がずれないように）
      for (const w of this.terrain.siloQuietWindows) {
        w.start += MUSIC_INTRO;
        w.end += MUSIC_INTRO;
      }
      this.shootingTimeTotal += MUSIC_INTRO;
      this.shootingTimeLimit += MUSIC_INTRO;
    }

    // ★ 予定された最後のザコが出現する時刻を記録（この時刻までは「残り敵が少ない」判定でボスを呼ばない）
    this.lastScriptedSpawnTime = 0;
    for (const e of this.enemies) {
      this.lastScriptedSpawnTime = Math.max(this.lastScriptedSpawnTime, e.getSpawnDelay());
    }
    // スクリプト出現の敵が無い面は、残り敵数によるボス呼び出しをせず時間切れ（残り32秒）でボスへ。
    // ★ 5面は主役が「地形＋壁際ミサイル」で、スクリプト敵（90度直角旋回機）はごく少数のため、
    //   その数機を倒した瞬間にボスが出ないよう同じく時間切れ方式に固定する
    if (this.enemies.length === 0 || this.stage === 5) {
      this.lastScriptedSpawnTime = 999;
    }
  }

  private spawnWaveBoss(): void {
    this.bossSpawned = true;
    this.bossWarningActive = false;
    this.bossWarningTimer = 0;
    this.sound.stopBossWarning();
    this.sound.playPhaseAlert('shooting');
    if (this.stage === 10) {
      this.showTransitionText(`BOSS ${this.bossRushIndex + 1} / ${BOSS_RUSH.length} ENGAGED!`, 1.3);
    } else {
      this.showTransitionText(`BOSS ENGAGED!`, 1.3);
    }

    let bossRank: 'GIANT_YELLOW' | 'GIANT_RED' | 'UFO_MOTHERSHIP' | 'GIGA_COLD_EYE' | 'SPACE_SERPENT_HEAD' = 'GIANT_YELLOW';
    let bossHp = 5;

    if (this.stage === 10) {
      // ★ ユーザー要望：最終面はボスが次々と出現するボスラッシュ！（5連戦・最後は最強UFO母船）
      const rushEntry = BOSS_RUSH[Math.min(this.bossRushIndex, BOSS_RUSH.length - 1)];
      bossRank = rushEntry.rank;
      bossHp = rushEntry.hp;
    } else if (this.stage === 6) {
      // Wave 6ボス：沙羅曼蛇・多関節スペースサーペントドラゴン！
      bossRank = 'SPACE_SERPENT_HEAD';
      bossHp = 42;
    } else if (this.stage === 5) {
      // 5面中ボス：超大型UFO母船（HPさらに倍：72！）
      bossRank = 'UFO_MOTHERSHIP';
      bossHp = 72;
    } else if (this.stage === 4) {
      // Wave 4ボス：超ド級ギガ・コールドアイ（撃破で2つのコールドアイに分裂！）
      bossRank = 'GIGA_COLD_EYE';
      bossHp = 40;
    } else if (this.stage >= 7) {
      // 7〜9面ボス：超高速頑強ジャイアントレッド（HP：44〜56！）
      bossRank = 'GIANT_RED';
      bossHp = (10 + (this.stage - 6) * 2) * 4;
    } else if (this.stage >= 3) {
      // 3面ボス：ジャイアントレッド
      bossRank = 'GIANT_RED';
      bossHp = (7 + this.stage) * 4;
    } else {
      // 1〜2面ボス：ジャイアントイエロー司令機
      bossRank = 'GIANT_YELLOW';
      bossHp = this.stage === 1 ? 20 : 32;
    }

    // ★ ユーザー要望：HARD のボスは耐久 1.5倍・速度 2倍（速度は下の speedScale で適用）
    //   EASY のボスは耐久 2/3（速度は NORMAL のまま＝動きのパターンを変えない）
    if (this.difficulty === 'HARD') {
      bossHp = Math.ceil(bossHp * 1.5);
    } else if (this.difficulty === 'EASY') {
      bossHp = Math.max(1, Math.round((bossHp * 2) / 3));
    }

    // ★ ユーザー要望：3面ってボスは下から来てもいいよね（SURPRISE_FROM_BOTTOMで画面下部から急上昇！）
    const pattern = this.stage === 10
      ? BOSS_RUSH[Math.min(this.bossRushIndex, BOSS_RUSH.length - 1)].pattern
      : (this.stage === 6 ? 'SERPENT_SLITHER' : (this.stage === 3 ? 'SURPRISE_FROM_BOTTOM' : 'FORMATION_LOOP'));
    const boss = new Enemy(bossRank, pattern, 4, 0, 0.1, undefined, 0, true, bossHp);
    boss.scoreValue = 3000 + this.stage * 1000 + (this.stage === 10 ? this.bossRushIndex * 2000 : 0);
    // ★ ユーザー要望：ラスボス（ボスラッシュ最後のUFO母船）は全ての動きを倍速に
    if (this.stage === 10 && this.bossRushIndex === BOSS_RUSH.length - 1) {
      boss.speedScale = 2.0;
    }
    // ★ ユーザー要望：HARD のボスは NORMAL の 2倍速（ラスボスは NORMAL で既に2倍なので HARD では4倍）
    if (this.difficulty === 'HARD') {
      boss.speedScale *= 2.0;
    }
    this.currentBoss = boss;
    this.enemies.push(boss);

    // Wave 6（＆Stage 10 ボスラッシュ）：スペースサーペントの多関節ボディセグメントを生成
    if (bossRank === 'SPACE_SERPENT_HEAD') {
      let prevSeg = boss;
      for (let s = 1; s <= 7; s++) {
        const bodySeg = new Enemy('SERPENT_BODY', 'SERPENT_SLITHER', 4, 0, 0.1, undefined, 0, false, 999);
        bodySeg.leader = prevSeg;
        bodySeg.segmentIndex = s;
        bodySeg.x = boss.x - s * 28;
        bodySeg.y = boss.y;
        this.enemies.push(bodySeg);
        prevSeg = bodySeg;
      }
    }

    // 護衛を2機随伴（高ステージ。★ 5面は地形だけで十分難しいので護衛なし）
    if (this.stage >= 4 && this.stage !== 5 && bossRank !== 'SPACE_SERPENT_HEAD') {
      this.enemies.push(new Enemy('YELLOW_COMMANDER', 'SWEEP_FROM_LEFT', 2, 1, 0.3));
      this.enemies.push(new Enemy('YELLOW_COMMANDER', 'SWEEP_FROM_RIGHT', 6, 1, 0.3));
    }

    // ★ ユーザー要望：ボス出現音（LFO 1 / LFO 2 をボス種別によってカテゴリ分け）
    // カテゴリ1: UFO_MOTHERSHIP, SPACE_SERPENT_HEAD（重厚低音）
    // カテゴリ2: GIANT_YELLOW, GIANT_RED, GIGA_COLD_EYE（電子パルス警報）
    const lfoCategory = (bossRank === 'UFO_MOTHERSHIP' || bossRank === 'SPACE_SERPENT_HEAD') ? 1 : 2;
    this.sound.startBossLfo(lfoCategory);
  }

  private updateShootingPhase(dt: number, input: Input): void {
    // ★ mp3 イントロ待ち（3秒）：時間が来たら「STAGE n」表示。敵の出現はこの3秒分あらかじめ遅らせてある
    if (this.stageTextDelay > 0) {
      this.stageTextDelay -= dt;
      if (this.stageTextDelay <= 0) {
        this.stageTextDelay = 0;
        this.sound.playPhaseAlert('shooting');
        this.showTransitionText(`STAGE ${this.stage}`, 1.8);
      }
    }

    // ★ ボス撃破後の爆発鑑賞ディレイ処理
    if (this.bossDying) {
      this.bossDeathTimer += dt;
      if (this.bossDeathTimer >= 1.2) {
        // ★ ユーザー要望：落下中ブロックがある場合はそれが落ちきる（または合体する）までクリアにさせない！
        if (!this.battlePiece || this.battlePiece.settled) {
          this.bossDying = false;
          this.onBossPhaseEnded();
          return;
        }
      }
    }

    this.shootingTimeLimit -= dt;
    this.formationOffsetAngle += dt * 2.4;

    // 自機ショット（ムーンクレスタ風ピシューン！ 押しっぱなし連射＋各銃口2発制限）
    if ((input.shoot || input.isMouseDown || input.justShoot || this.clickFireTimer > 0) && this.player.fireCooldown <= 0) {
      const newBullets = this.player.shootBullets(this.playerBullets);
      if (newBullets.length > 0) {
        this.playerBullets.push(...newBullets);
        // ★ ユーザー要望：発射した弾の数だけ音を鳴らす（同時発音数の上限は Sound 側で制御）
        this.sound.playShootVolley(newBullets.map(b => b.pieceType));
        this.player.fireCooldown = PLAYER_FIRE_INTERVAL;
      }
    }

    // ★ ユーザー要望：
    // ・Oミノだけになってから10秒後にテトリミノが落ちてくる
    // ・2つのテトリミノ（Oミノ＋1つ）になってから10秒たったらまたテトリミノが落ちてくる
    // ・もし3つ以上のテトリミノの時は特に追加で出さない
    const pieceCount = this.player.pieces.length;
    // ★ ユーザー要望：mp3 イントロ待ち中（stageTextDelay > 0）はレスキュー猶予を全く消費しない
    //   （減算もリセットもしない）。「STAGE n」表示（本編開始）と同時にカウントを開始し、
    //   そこから RESCUE_FIRST_DELAY 秒後に最初のレスキューが出る
    if (this.stageTextDelay <= 0) {
      if (pieceCount < 3) {
        if (!this.battlePiece || this.battlePiece.settled) {
          this.rescueSpawnCooldown -= dt;
          if (this.rescueSpawnCooldown <= 0) {
            this.spawnRescuePiece();
            // 次の投下判定まで7秒
            this.rescueSpawnCooldown = GameManager.RESCUE_NEXT_DELAY;
          }
        }
      } else {
        // 3つ以上のテトリミノがある時は追加で出さない（タイマーは7秒待機でリセット）
        this.rescueSpawnCooldown = GameManager.RESCUE_NEXT_DELAY;
      }
    }

    // シューティング中の救済落下テトリミノ更新＆ドッキング判定
    if (this.battlePiece && !this.battlePiece.settled) {
      this.battlePiece.fallTimer += dt;
      if (this.battlePiece.dockCooldown && this.battlePiece.dockCooldown > 0) {
        this.battlePiece.dockCooldown -= dt;
      }

      const GRAVITY = 140;
      const MAX_FALL_SPEED = 78; // ★ 救済テトリミノも約3割アップ
      this.battlePiece.vy += GRAVITY * dt;
      if (this.battlePiece.vy > MAX_FALL_SPEED) {
        this.battlePiece.vy = MAX_FALL_SPEED;
      }

      this.battlePiece.vx *= (1 - 0.5 * dt);
      if (this.stage !== 5 && this.stage !== 9) {
        this.battlePiece.vx += Math.sin(this.battlePiece.fallTimer * 1.5) * 15 * dt;
      }

      this.battlePiece.x += this.battlePiece.vx * dt;
      this.battlePiece.y += this.battlePiece.vy * dt;

      // 左右画面端バウンド
      if (this.battlePiece.x < 15) {
        this.battlePiece.x = 15;
        this.battlePiece.vx = Math.abs(this.battlePiece.vx) * 0.8;
      } else if (this.battlePiece.x > CANVAS_WIDTH - 15 - BLOCK_SIZE * 3) {
        this.battlePiece.x = CANVAS_WIDTH - 15 - BLOCK_SIZE * 3;
        this.battlePiece.vx = -Math.abs(this.battlePiece.vx) * 0.8;
      }

      this.battlePiece.gx = Math.round(this.battlePiece.x / BLOCK_SIZE);
      this.battlePiece.gy = Math.round(this.battlePiece.y / BLOCK_SIZE);

      // 弾ヒットによる回転＆上反動！
      // ★ ユーザー要望（スマホ）：タッチ操作では弾でミノを回転・ノックバックさせない。
      //   （代わりにミノを直接タッチして回す。tryTouchRotatePiece 参照）
      //   弾は当たり判定ごと素通りさせ、自機の弾がミノに吸われないようにする。
      const pieceBounds = this.battlePiece.piece.getBoundingBox(this.battlePiece.x, this.battlePiece.y);
      const pieceCenterX = (pieceBounds.minX + pieceBounds.maxX) / 2;
      const bulletsAffectPiece = !(this.lastInput && this.lastInput.touchMode);

      for (let bi = bulletsAffectPiece ? this.playerBullets.length - 1 : -1; bi >= 0; bi--) {
        const pb = this.playerBullets[bi];
        if (pb.isDead) continue;

        if (
          pb.x >= pieceBounds.minX - 4 &&
          pb.x <= pieceBounds.maxX + 4 &&
          pb.y >= pieceBounds.minY - 4 &&
          pb.y <= pieceBounds.maxY + 4
        ) {
          pb.isDead = true;
          this.particles.emitSparks(pb.x, pb.y, this.battlePiece.piece.color, 12);
          this.sound.playHit();

          this.battlePiece.vy = -130;
          const hitOffset = pb.x - pieceCenterX;
          if (hitOffset < -6) {
            this.battlePiece.piece.rotate();
            this.battlePiece.vx = Math.min(this.battlePiece.vx + 45, 90);
          } else if (hitOffset > 6) {
            this.battlePiece.piece.rotateCounter();
            this.battlePiece.vx = Math.max(this.battlePiece.vx - 45, -90);
          } else {
            this.battlePiece.vy = -165;
          }
          this.battlePiece.dockCooldown = 0.4;
        }
      }

      // 自機との近接ドッキング判定！
      const canDockBattle = (!this.battlePiece.dockCooldown || this.battlePiece.dockCooldown <= 0) && this.battlePiece.vy > 0;
      const playerBounds = this.player.getBoundingBox();
      const isClose =
        pieceBounds.maxX >= playerBounds.minX - 25 &&
        pieceBounds.minX <= playerBounds.maxX + 25 &&
        pieceBounds.maxY >= playerBounds.minY - 30 &&
        pieceBounds.minY <= playerBounds.maxY + 15;

      if (canDockBattle && isClose) {
        const dockRes = this.player.tryDockFromPixel(this.battlePiece.piece, this.battlePiece.x, this.battlePiece.y, BLOCK_SIZE * 1.15);
        if (dockRes.docked) {
          this.battlePiece.settled = true;
          this.sound.playDock();
          this.particles.emitDockRing(this.battlePiece.x + BLOCK_SIZE, this.battlePiece.y + BLOCK_SIZE, this.battlePiece.piece.color);
          this.score += 600;
          this.showTransitionText('DOCK SUCCESS!', 1.2);
          this.battlePiece = null;
          // 合体後、まだ2パーツ（Oミノ＋1パーツ）なら7秒後に次の救済、3パーツ以上なら救済休止
          this.rescueSpawnCooldown = GameManager.RESCUE_NEXT_DELAY;
        }
      }

      // 画面下端を抜けた場合（拾えなかった時は速やかに再投下）
      if (this.battlePiece && this.battlePiece.y > CANVAS_HEIGHT + 20) {
        this.battlePiece.settled = true;
        this.battlePiece = null;
        this.rescueSpawnCooldown = 1.0;
      }
    }

    // ★ 地形（洞窟壁）のスクロール更新＆スクランブル風 壁面ミサイル発射台の連動
    // ★ ユーザー要望：5面（斜め地形）はスクロール速度を 2/3 → さらに 2/3（合計 4/9）に
    const terrainSpeedScale = this.stage === 5 ? 4 / 9 : 1;
    this.terrain.update(dt, (this.phase === 'SHOOTING' ? 140 : 60) * terrainSpeedScale, (lx, ly, vx, vy) => {
      // 洞窟壁から横・斜めへミサイル噴射発射！
      const m = new Enemy('TERRAIN_MISSILE', 'TERRAIN_LAUNCH', 0, 0, 0);
      m.x = lx;
      m.y = ly;
      m.vx = vx;
      m.vy = vy;
      // ★ 壁際で約1.3秒、上下に揺れる予備動作を見せてから突っ込む
      m.prelaunchTimer = Enemy.PRELAUNCH_TIME;
      m.prelaunchPhase = Math.random() * Math.PI * 2;
      m.prelaunchBaseY = ly;
      this.enemies.push(m);
      this.particles.emitSparks(lx, ly, '#ff4400', 8);
    });

    // 要望②：自機 vs 地形の衝突判定（狭窄洞窟でパーツ破損・Oミノ破壊でゲームオーバー）
    if (this.terrainHitCooldown > 0) {
      this.terrainHitCooldown -= dt;
    }

    // ★ 開始直後の無敵中は、地形に触れても音・画面揺れ・バウンドを一切起こさない（演出なしの無敵）
    if (this.terrain.enabled && !this.player.isDead && this.terrainHitCooldown <= 0 && this.player.spawnGraceTimer <= 0) {
      // コア（Oミノ）以外の外装パーツから優先して衝突判定（外装が壁に当たって削れる）
      const nonCorePieces = this.player.pieces.filter(p => p.piece.type !== 'O');
      const targetPieces = nonCorePieces.length > 0 ? nonCorePieces : this.player.pieces;

      let collided = false;
      for (const attached of targetPieces) {
        for (const cell of attached.piece.cells) {
          const cx = this.player.anchorX + (attached.relGx + cell.gx) * BLOCK_SIZE;
          const cy = this.player.anchorY + (attached.relGy + cell.gy) * BLOCK_SIZE;

          if (this.terrain.isRectColliding(cx, cy, BLOCK_SIZE, BLOCK_SIZE)) {
            const hitRes = this.player.checkHit(cx + BLOCK_SIZE / 2, cy + BLOCK_SIZE / 2, this.particles);
            this.sound.playExplosion(false);
            this.screenShake = 12;
            this.terrainHitCooldown = 0.35; // 最低0.35秒のクールダウンで連続即死を防止

            // ★ ユーザー要望：壁に当たった時、まだ外装テトリミノが付いていればそれが身代わりに壊れ、
            //   本体は数秒間の無敵時間に入る（壁に沿った連続ヒットで即死しない）
            if (hitRes.pieceDestroyed && !this.player.isDead) {
              const WALL_GRACE = 2.5;
              // ★ バリアのリングではなく、点滅＋白フラッシュの猶予無敵で表示
              this.player.graceTimer = Math.max(this.player.graceTimer, WALL_GRACE);
              this.terrainHitCooldown = WALL_GRACE;
              this.showTransitionText('PART LOST! (INVINCIBLE 2.5 SEC)', 1.1);
            }

            // 壁から弾き返される物理バウンス
            if (this.terrain.direction === 'UP') {
              // 左右の壁から中央側へ押し戻す
              if (cx < CANVAS_WIDTH / 2) {
                this.player.vx = Math.max(this.player.vx, 180);
                this.player.anchorX += 8;
              } else {
                this.player.vx = Math.min(this.player.vx, -180);
                this.player.anchorX -= 8;
              }
            } else {
              // 上下の壁から中央側へ押し戻す
              if (cy < CANVAS_HEIGHT / 2) {
                this.player.vy = Math.max(this.player.vy, 180);
                this.player.anchorY += 8;
              } else {
                this.player.vy = Math.min(this.player.vy, -180);
                this.player.anchorY -= 8;
              }
            }

            if (hitRes.detachedPieces && hitRes.detachedPieces.length > 0) {
              this.spawnDetachedFloatingPieces(hitRes.detachedPieces);
            }
            collided = true;
            break;
          }
        }
        if (collided) break;
      }
    }

    // プレイヤー弾の更新
    for (let i = this.playerBullets.length - 1; i >= 0; i--) {
      const b = this.playerBullets[i];
      b.update(dt);

      // 自弾 vs 地形壁（壁に当たると弾消滅）
      if (!b.isDead && this.terrain.enabled && this.terrain.isColliding(b.x, b.y)) {
        b.isDead = true;
        this.particles.emitSparks(b.x, b.y, '#ffaa00', 4);
      }

      if (b.isDead) {
        this.playerBullets.splice(i, 1);
      }
    }

    // 要望③：切断されて浮遊・落下中のパーツの更新＆再回収
    for (let i = this.detachedPieces.length - 1; i >= 0; i--) {
      const dp = this.detachedPieces[i];
      dp.x += dp.vx * dt;
      dp.y += dp.vy * dt;
      dp.lifeTime += dt;

      // 画面左右バウンド
      if (dp.x < 10) { dp.x = 10; dp.vx = Math.abs(dp.vx); }
      if (dp.x > CANVAS_WIDTH - 50) { dp.x = CANVAS_WIDTH - 50; dp.vx = -Math.abs(dp.vx); }

      // プレイヤーが自機を寄せてキャッチ（再ドッキング！）
      const playerBounds = this.player.getBoundingBox();
      const isClose =
        dp.x >= playerBounds.minX - 20 &&
        dp.x <= playerBounds.maxX + 20 &&
        dp.y >= playerBounds.minY - 20 &&
        dp.y <= playerBounds.maxY + 20;

      if (isClose) {
        const dockRes = this.player.tryDockFromPixel(dp.piece, dp.x, dp.y);
        if (dockRes.docked) {
          this.sound.playDock();
          this.particles.emitDockRing(dp.x, dp.y, dp.piece.color);
          this.score += 400;
          this.detachedPieces.splice(i, 1);
          continue;
        }
      }

      // 画面下端を抜けたら消滅
      if (dp.y > CANVAS_HEIGHT + 30) {
        this.detachedPieces.splice(i, 1);
      }
    }

    this.updateFieldItems(dt);

    // 敵の更新（弾なし・体当たりのみ！ 面が進むごとに同時急降下数が増加して激化）
    // ★ ユーザー要望：ギャラガ風味の体当たり急降下をより頻繁に発生させる
    const divingCount = this.enemies.filter(e => e.pattern === 'KAMIKAZE_DIVE').length;
    const maxDiving = Math.min(8, 3 + this.stage);
    const canDive = divingCount < maxDiving;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const justDived = e.update(dt, this.formationOffsetAngle, this.player.anchorX, this.player.anchorY, canDive);
      if (justDived) {
        this.sound.playDiveSiren();
      }
      // ★ ユーザー要望：高速で突っ込んでくるメテオタイプの敵の突っ込んでくる時にレーザー音を出す
      if (e.justFiredLaser) {
        this.sound.playMeteorLaser();
        e.justFiredLaser = false;
      }
      if (e.isDead) {
        this.enemies.splice(i, 1);
      }
    }

    // ★ ユーザー要望：宇宙基地サイレンはボス登場時に鳴らす、予告として そしてボス登場
    if (!this.bossSpawned) {
      // ★ バグ修正：ザコが少ない面（5面など）で開幕即ボスにならないよう、
      //   「残り敵6体以下」条件は予定のザコが全て出現した後にのみ有効
      const elapsed = this.shootingTimeTotal - this.shootingTimeLimit;
      const allScriptedSpawned = elapsed >= this.lastScriptedSpawnTime + 1.0;
      if (!this.bossWarningActive && (this.shootingTimeLimit <= 32 || (allScriptedSpawned && this.enemies.length <= 6))) {
        this.bossWarningActive = true;
        this.bossWarningTimer = 3.5;
        this.sound.playBossWarning();
        this.showTransitionText('WARNING: BOSS APPROACHING', 1.3);
        this.screenShake = 6;
      }
      if (this.bossWarningActive) {
        this.bossWarningTimer -= dt;
        // 予告中は警告テキストを点滅・維持
        this.transitionAlpha = Math.sin(Date.now() * 0.015) > 0 ? 1.0 : 0.45;
        if (this.bossWarningTimer <= 0) {
          this.bossWarningActive = false;
          this.spawnWaveBoss();
        }
      }
    }

    // ★ ユーザー要望：ボス戦中、ボス自体が部下のそれなりにめんどくさい敵編隊や変な動きの敵を生み出して撹乱！
    // ★ ユーザー要望：5面のボスはザコを引き連れない
    if (this.currentBoss && !this.currentBoss.isDead && !this.bossDying && this.stage !== 5) {
      this.bossMinionTimer += dt;
      // ★ ユーザー要望：ボスが出すザコを2倍に（間隔を半分に短縮）。さらに「まだ少ない」との指摘で再度2倍
      //   （2.8/4.0 → 1.4/2.0 → 0.7/1.0 秒間隔）
      const spawnInterval = this.difficulty === 'HARD' ? 0.7 : 1.0;
      if (this.bossMinionTimer >= spawnInterval) {
        this.bossMinionTimer = 0;
        const b = this.currentBoss;
        const minionTypes = ['STARFORCE_GARI', 'GRADIUS_FAN', 'DART_MISSILE', 'TOROID_SCOUT', 'VANGUARD_POD'] as const;
        const mType = minionTypes[Math.floor(Math.random() * minionTypes.length)];

        if (mType === 'STARFORCE_GARI') {
          // ボスから飛び出すガリ！
          const gari = new Enemy('STARFORCE_GARI', 'STARFORCE_GARI_MOVE', 0, 0, 0);
          gari.x = b.x + b.width / 2 - gari.width / 2;
          gari.y = b.y + b.height;
          this.enemies.push(gari);
          this.particles.emitSparks(gari.x, gari.y, '#00ffff', 12);
        } else if (mType === 'GRADIUS_FAN') {
          // ボス左右ハッチから2機同時発進するグラディウス開幕ファン編隊！
          const f1 = new Enemy('GRADIUS_FAN', 'GRADIUS_FLEET', 1, 0, 0);
          f1.x = b.x - 20;
          f1.y = b.y + b.height / 2;
          const f2 = new Enemy('GRADIUS_FAN', 'GRADIUS_FLEET', 5, 0, 0);
          f2.x = b.x + b.width + 20;
          f2.y = b.y + b.height / 2;
          this.enemies.push(f1, f2);
          this.particles.emitSparks(b.x, b.y + b.height, '#ffaa00', 14);
        } else if (mType === 'DART_MISSILE') {
          // 索敵加速ミサイルを2発放出！
          const m1 = new Enemy('DART_MISSILE', 'DELAYED_DART', 0, 0, 0);
          m1.x = b.x;
          m1.y = b.y + b.height;
          const m2 = new Enemy('DART_MISSILE', 'DELAYED_DART', 1, 0, 0);
          m2.x = b.x + b.width;
          m2.y = b.y + b.height;
          this.enemies.push(m1, m2);
        } else if (mType === 'TOROID_SCOUT') {
          const toroid = new Enemy('TOROID_SCOUT', 'XEVIOUS_TOROID', 0, 0, 0);
          toroid.x = b.x + b.width / 2;
          toroid.y = b.y + b.height;
          this.enemies.push(toroid);
        } else {
          const pod = new Enemy('VANGUARD_POD', 'VANGUARD_CRUISE', 0, 0, 0);
          pod.x = b.x + b.width / 2;
          pod.y = b.y + b.height;
          this.enemies.push(pod);
        }
      }
    }

    // プレイヤー弾 vs 敵・地形壁面サイロ
    for (let i = this.playerBullets.length - 1; i >= 0; i--) {
      const pb = this.playerBullets[i];
      if (pb.isDead) continue;

      // プレイヤー弾 vs 壁面ミサイル発射台
      if (this.terrain.enabled) {
        const siloHit = this.terrain.checkBulletHit(pb.x, pb.y, pb.width, pb.height);
        if (siloHit) {
          pb.isDead = true;
          this.particles.emitSparks(siloHit.x, siloHit.y, '#ffff00', 8);
          // ★ ユーザー要望：Arcade-Shooter01-2(Damage) 敵ダメージ音
          this.sound.playEnemyDamage();
          if (siloHit.score >= 400) {
            this.sound.playExplosion(false);
            this.particles.emitExplosion(siloHit.x, siloHit.y, '#ff4400', 18);
            this.score += siloHit.score;
          }
          continue;
        }
      }

      for (const enemy of this.enemies) {
        if (enemy.isDead) continue;

        if (
          Math.abs(pb.x - (enemy.x + enemy.width / 2)) < (pb.width + enemy.width) / 2 &&
          Math.abs(pb.y - (enemy.y + enemy.height / 2)) < (pb.height + enemy.height) / 2
        ) {
          pb.isDead = true;
          this.particles.emitSparks(pb.x, pb.y, pb.color, 8);

          // ★ ユーザー要望：ボスにあたったときのダメージ音、敵ダメージ音（Arcade-Shooter01-2）
          const isBossTarget = enemy.isBoss || enemy === this.currentBoss;
          this.sound.playEnemyDamage(isBossTarget);

          const killed = enemy.hit(1);
          if (killed) {
            // 要望①：ムーンクレスタ名物 SPLITTING_EYE（コールドアイ）が撃破されたら2つの MINI_EYE（スーパーアイ）に分裂！
            if (enemy.rank === 'SPLITTING_EYE') {
              this.sound.playMoonSplit();
              this.particles.emitExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ff0055', 24);
              const mini1 = new Enemy('MINI_EYE', 'MOON_SUPER_EYE', 0, 0, 0);
              mini1.x = enemy.x - 14;
              mini1.y = enemy.y;
              mini1.vx = -220; // 鋭く左へ弾き飛ぶ
              mini1.vy = 85;
              mini1.movingRight = false;

              const mini2 = new Enemy('MINI_EYE', 'MOON_SUPER_EYE', 0, 0, 0);
              mini2.x = enemy.x + 14;
              mini2.y = enemy.y;
              mini2.vx = 220; // 鋭く右へ弾き飛ぶ
              mini2.vy = 85;
              mini2.movingRight = true;

              this.enemies.push(mini1, mini2);
              this.score += enemy.scoreValue;
              break;
            }

            // ★ Wave 4 ボス：超ド級ギガ・コールドアイ（GIGA_COLD_EYE）撃破時に2つのコールドアイに分裂！
            if (enemy.rank === 'GIGA_COLD_EYE') {
              this.sound.playMoonSplit();
              this.sound.playBossExplosion();
              this.particles.emitBossExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.width, enemy.height);
              
              const eye1 = new Enemy('SPLITTING_EYE', 'MOON_COLD_EYE', 1, 0, 0);
              eye1.x = enemy.x - 30;
              eye1.y = enemy.y;
              eye1.vx = -180;
              eye1.vy = 60;
              eye1.movingRight = false;

              const eye2 = new Enemy('SPLITTING_EYE', 'MOON_COLD_EYE', 3, 0, 0);
              eye2.x = enemy.x + 30;
              eye2.y = enemy.y;
              eye2.vx = 180;
              eye2.vy = 60;
              eye2.movingRight = true;

              this.enemies.push(eye1, eye2);
              this.score += enemy.scoreValue;
              this.sound.stopBossLfo();
              this.currentBoss = null;
              this.hitStopTimer = 0.08;
              this.screenShake = 16;
              break;
            }

            // ★ Wave 6 ボス：スペースサーペント頭部破壊時に全胴体セグメントが連鎖大爆発！
            if (enemy.rank === 'SPACE_SERPENT_HEAD') {
              for (const other of this.enemies) {
                if (other.rank === 'SERPENT_BODY') {
                  other.isDead = true;
                  this.particles.emitExplosion(other.x + other.width / 2, other.y + other.height / 2, '#ffea00', 30, true);
                  this.score += other.scoreValue;
                }
              }
            }

            const isGiant = enemy.rank.startsWith('GIANT') || enemy.rank === 'UFO_MOTHERSHIP';

            if (enemy === this.currentBoss || enemy.isBoss) {
              this.sound.playBossExplosion();
              this.particles.emitBossExplosion(
                enemy.x + enemy.width / 2,
                enemy.y + enemy.height / 2,
                enemy.width,
                enemy.height
              );
              this.score += enemy.scoreValue;
              this.sound.stopBossLfo();
              this.onBossDefeatedMusic();
              this.currentBoss = null;
              this.bossDying = true;
              this.bossDeathTimer = 0;
              this.hitStopTimer = 0.08;
              this.screenShake = 14;

              this.chainExplodeRemainingZako(enemy);
              return;
            } else {
              if (isGiant) {
                this.sound.playExplosion(true);
              } else {
                this.sound.playEnemyPop(enemy.rank);
                this.registerZakoKill();
              }
              this.particles.emitExplosion(
                enemy.x + enemy.width / 2,
                enemy.y + enemy.height / 2,
                '#ffaa00',
                isGiant ? 50 : 20,
                isGiant
              );
              this.score += enemy.scoreValue;
              this.hitStopTimer = isGiant ? 0.05 : 0.025;
              this.screenShake = Math.max(this.screenShake, isGiant ? 6 : 2.5);
            }
          } else if (isBossTarget) {
            // ★ ユーザー要望：ボスがダメージを受けているときのエフェクトをもっと派手に。
            //   白フラッシュ（Enemy 側で白い発光オーバーレイ）＋衝撃波リング＋火花＋強めの揺れ
            enemy.flashTime = Math.max(enemy.flashTime, 0.2);
            this.particles.emitSparks(pb.x, pb.y, '#ffffff', 16);
            this.particles.emitSparks(pb.x, pb.y, '#ffee66', 10);
            this.particles.emitDockRing(pb.x, pb.y, '#ffffff');
            this.particles.emitExplosion(pb.x, pb.y, '#ffffff', 10, false);
            this.hitStopTimer = Math.max(this.hitStopTimer, 0.045);
            this.screenShake = Math.max(this.screenShake, 6);
          } else {
            this.hitStopTimer = 0.025;
            this.screenShake = Math.max(this.screenShake, 3);
          }
          break;
        }
      }
    }

    // ★ ユーザー要望：バリアは「盾」ではなく「武器」でもある。
    //   円（見た目の外周より少し内側＝getBarrierHitRadius）に敵が入ると焼かれる。
    //   矩形ではなく円で判定するので、リングの見た目どおりの当たり方になる。
    //   ★ ユーザー要望（追加）：ザコも即死ではなく「一定時間触れていると死ぬ」。
    //     一瞬かすっただけでは死なず、突っ込んでくると途中で焼き切れる。
    //     深く入るほど速く焼ける（BARRIER_BURN_DEEP_BOOST）ので、
    //     浅いかすりは生き残り、まっすぐ突っ込むと自機に届く前に燃え尽きる。
    //   ボスだけは焼き切りではなく、接触している間だけ継続ダメージ（BARRIER_BOSS_DPS）。
    if (this.player.barrierTimer > 0 && !this.player.isDead) {
      const bc = this.player.getBarrierCenter();
      const br = this.player.getBarrierHitRadius();
      const br2 = br * br;
      for (const enemy of this.enemies) {
        if (enemy.isDead) continue;
        // 円 vs 矩形：円の中心を敵の矩形にクランプした点との距離で判定
        const nx = Math.min(Math.max(bc.x, enemy.x), enemy.x + enemy.width);
        const ny = Math.min(Math.max(bc.y, enemy.y), enemy.y + enemy.height);
        const dx = bc.x - nx;
        const dy = bc.y - ny;
        const d2 = dx * dx + dy * dy;
        if (d2 > br2) {
          // 円の外：焼けはゆっくり冷める（出入りを繰り返しても永久に貯まらない）
          if (enemy.barrierBurn > 0) {
            enemy.barrierBurn = Math.max(0, enemy.barrierBurn - dt * GameManager.BARRIER_BURN_COOL);
          }
          continue;
        }

        if (enemy.isBoss || enemy === this.currentBoss) {
          // ボスはバリアでも即死しない（体当たりし続けて削る）
          const bossKilled = enemy.hit(GameManager.BARRIER_BOSS_DPS * dt);
          this.particles.emitSparks(nx, ny, '#00ffff', 3);
          if (bossKilled) {
            this.sound.playBossExplosion();
            this.sound.stopBossLfo();
            this.particles.emitBossExplosion(
              enemy.x + enemy.width / 2,
              enemy.y + enemy.height / 2,
              enemy.width,
              enemy.height
            );
            this.score += enemy.scoreValue;
            this.onBossDefeatedMusic();
            this.currentBoss = null;
            this.bossDying = true;
            this.bossDeathTimer = 0;
            this.hitStopTimer = 0.08;
            this.screenShake = 16;
            this.chainExplodeRemainingZako(enemy);
            return;
          }
          continue;
        }

        // 焼け進行：めり込みの深さに比例。外周寄りの不感帯では一切焼けない
        const depth = br > 0 ? 1 - Math.sqrt(d2) / br : 1;
        const dz = GameManager.BARRIER_BURN_DEAD_ZONE;
        const effDepth = depth <= dz ? 0 : (depth - dz) / (1 - dz);
        if (effDepth <= 0) {
          // かすっているだけ：火花だけ出して、焼けは進めない
          if (Math.random() < 0.25) this.particles.emitSparks(nx, ny, '#00ffff', 2);
          continue;
        }
        enemy.barrierBurn += dt * effDepth;
        // 焼かれている間は光らせて「効いている」ことを見せる
        enemy.flashTime = 0.1;
        if (Math.random() < 0.6) this.particles.emitSparks(nx, ny, '#00ffff', 3);

        if (enemy.barrierBurn < GameManager.BARRIER_BURN_TIME) continue;

        enemy.isDead = true;
        this.sound.playEnemyPop(enemy.rank);
        this.registerZakoKill();
        this.particles.emitExplosion(
          enemy.x + enemy.width / 2,
          enemy.y + enemy.height / 2,
          '#00ffff',
          18,
          false
        );
        this.score += enemy.scoreValue;
        this.screenShake = Math.max(this.screenShake, 2.5);
      }
    }

    // 敵本体 vs 自機 体当たり判定（ムーンクレスタ仕様！）
    // ★ 性能＆見た目のバグ修正（ブロードフェーズ）
    //   Player.checkHit() は「バリア／無敵中なら、判定する前にまず火花を出す」仕様。
    //   小型の敵には距離チェックが無く全機に対して checkHit を呼んでいたため、
    //   バリア中(5秒)や被弾直後の無敵中(2.5秒)は、画面外に待機している敵まで含めた
    //   全ての敵から毎フレーム火花が出ていた（9面HARDでは最大768個/フレーム）。
    //   処理落ちの原因であると同時に、見た目にもおかしかった。
    //   自機の外接矩形に入っていない敵は checkHit を呼ばずに飛ばす。
    //   checkHit は「点が自機セルの中にあるか」しか見ておらず、セルは必ず外接矩形の中にあるので、
    //   この間引きで当たり判定の結果が変わることはない。
    const playerBox = this.player.getBoundingBox();
    for (const enemy of this.enemies) {
      if (enemy.isDead) continue;
      // ★ バグ修正：従来は敵の中心1点だけを自機セルと照合していたため、ボスなど大型の敵は
      //   胴体が自機に重なっていても中心点が自機セルに入らず「当たっていない」状態になっていた。
      //   大型の敵は矩形同士で重なりを判定し、重なった自機セルの中心をヒット位置として渡す
      let hitPx = enemy.x + enemy.width / 2;
      let hitPy = enemy.y + enemy.height / 2;
      const isLarge = enemy.isBoss || enemy.width >= 56 || enemy.height >= 56;
      if (isLarge) {
        // ★ ユーザー要望：ボス（大型敵）の体当たり判定は見た目より小さく、中心の縦横1/2の矩形のみ（かすり死防止）
        const shrink = enemy.isBoss ? 0.5 : 0.75;
        const hw = enemy.width * shrink;
        const hh = enemy.height * shrink;
        const hx = enemy.x + (enemy.width - hw) / 2;
        const hy = enemy.y + (enemy.height - hh) / 2;
        let overlap = false;
        for (const attached of this.player.pieces) {
          for (const cell of attached.piece.cells) {
            const cx = this.player.anchorX + (attached.relGx + cell.gx) * BLOCK_SIZE;
            const cy = this.player.anchorY + (attached.relGy + cell.gy) * BLOCK_SIZE;
            if (
              cx < hx + hw &&
              cx + BLOCK_SIZE > hx &&
              cy < hy + hh &&
              cy + BLOCK_SIZE > hy
            ) {
              hitPx = cx + BLOCK_SIZE / 2;
              hitPy = cy + BLOCK_SIZE / 2;
              overlap = true;
              break;
            }
          }
          if (overlap) break;
        }
        if (!overlap) continue;
      } else if (
        hitPx < playerBox.minX || hitPx > playerBox.maxX ||
        hitPy < playerBox.minY || hitPy > playerBox.maxY
      ) {
        continue; // 自機の外接矩形の外＝絶対に当たらないので checkHit すら呼ばない
      }
      const hitRes = this.player.checkHit(hitPx, hitPy, this.particles);
      if (hitRes.hit) {
        // 切り離されたパーツが発生した場合は浮遊物としてスポーン
        if (hitRes.detachedPieces && hitRes.detachedPieces.length > 0) {
          this.spawnDetachedFloatingPieces(hitRes.detachedPieces);
        }

        const killed = enemy.hit(5);
        this.sound.playExplosion(true);
        this.screenShake = 12;
        this.hitStopTimer = 0.05;
        // 大型の敵が生き残った場合、重なったまま毎フレーム連続ヒットして即全損しないよう猶予無敵を付与
        if (!killed && isLarge && !this.player.isDead) {
          this.player.graceTimer = Math.max(this.player.graceTimer, 1.2);
        }
        if (killed && (enemy === this.currentBoss || enemy.isBoss)) {
          this.sound.playBossExplosion();
          this.particles.emitBossExplosion(
            enemy.x + enemy.width / 2,
            enemy.y + enemy.height / 2,
            enemy.width,
            enemy.height
          );
          this.score += enemy.scoreValue;
          this.onBossDefeatedMusic();
          this.currentBoss = null;
          this.bossDying = true;
          this.bossDeathTimer = 0;
          this.hitStopTimer = 0.08;
          this.screenShake = 16;
          this.chainExplodeRemainingZako(enemy);
          return;
        }
      }
    }

    // タイムオーバーまたは敵全滅クリア判定（落下ブロックがある場合は落ちきるまで待つ）
    // ★ バグ修正：ボス出現後は「残り時間切れ」だけではクリアにしない。
    //   以前はボスが生きたまま時間切れになると、撃破演出なしで静かにステージクリアしてしまっていた
    //   （HARDでボスHPが上がり撃破が間に合わないと発生しやすかった）。
    //   ボス戦中は必ず撃破（bossSpawned && !currentBoss）が条件になる。ザコ戦中の時間切れは従来どおり有効
    const bossAliveOrPending = this.bossSpawned && !!this.currentBoss;
    if (
      !this.bossDying &&
      !bossAliveOrPending &&
      (!this.battlePiece || this.battlePiece.settled) &&
      ((this.bossSpawned && this.enemies.length === 0) || this.shootingTimeLimit <= 0)
    ) {
      this.onBossPhaseEnded();
    }
  }

  // ★ ステージBGM（mp3版）はボス撃破でフェードアウト。10面のボスラッシュは最後のボスを倒した時のみ
  private onBossDefeatedMusic(): void {
    if (this.stage === 10 && this.bossRushIndex < BOSS_RUSH.length - 1) return;
    this.sound.stopStageMusicOnBossDefeat();
  }

  // ★ ボス撃破後の処理：Stage 10 はボスラッシュなので次のボスを予告して呼び出す。それ以外はステージクリア
  private onBossPhaseEnded(): void {
    // ★ ユーザー要望：ボスと相打ちでプレイヤーが死んだ場合は、クリアや次ボスへ進まずゲームオーバーを優先
    if (this.player.isDead) return;
    if (this.stage === 10 && this.bossSpawned && this.bossRushIndex < BOSS_RUSH.length - 1) {
      this.bossRushIndex++;
      this.bossSpawned = false;
      this.currentBoss = null;
      this.bossDying = false;
      this.bossDeathTimer = 0;
      this.bossMinionTimer = 0;
      // ボスラッシュ中はタイムアップでクリアにならないよう、残り時間を確保
      this.shootingTimeLimit = Math.max(this.shootingTimeLimit, 60);
      // 次のボス予告サイレン
      this.bossWarningActive = true;
      this.bossWarningTimer = 3.0;
      this.sound.playBossWarning();
      this.showTransitionText(`WARNING: NEXT BOSS ${this.bossRushIndex + 1} / ${BOSS_RUSH.length}`, 1.3);
      this.screenShake = 8;
      return;
    }
    this.clearStage();
  }

  private clearStage(): void {
    if (this.player.isDead) return; // 自機死亡中はクリア不可（相打ち時はゲームオーバー）
    this.sound.stopBGM();
    this.sound.stopBossLfo();
    this.sound.stopBossWarning();
    this.bossWarningActive = false;
    this.bossWarningTimer = 0;
    this.sound.playVictory();
    this.state = 'STAGE_CLEAR';
    this.stateTimer = 2.5;
    this.score += 1000 * this.stage;
    this.saveHighScore();
    this.showTransitionText(`STAGE ${this.stage} CLEAR!`);
  }

  private triggerGameOver(): void {
    this.sound.stopBGM();
    this.sound.stopBossLfo();
    this.sound.stopBossWarning();
    this.bossWarningActive = false;
    this.bossWarningTimer = 0;
    this.sound.playGameOver(); // ムーンクレスタ風 哀愁下降アルペジオ！
    this.state = 'GAMEOVER';
    this.stateTimer = 1.0;
    this.screenShake = 0; // ユーザー要望：死んだあとセレクト画面やタイトル画面が揺れるのを確実に止める
    this.gameOverSelection = 'CONTINUE';
    this.saveHighScore();
    this.showTransitionText('GAME OVER');
  }

  // ユーザー要望：2面で死んだらコンティニューできるように、タイトルに戻るとコンティニューの2択
  private handleGameOverConfirm(): void {
    this.sound.stopBossLfo();
    this.sound.stopBossWarning();
    this.bossWarningActive = false;
    this.bossWarningTimer = 0;
    this.playerDeathSoundPlayed = false;
    this.deathDelay = 0;
    if (this.gameOverSelection === 'CONTINUE') {
      this.sound.playPhaseAlert('tetris');
      this.state = 'PLAYING';
      this.fallingPieces = [];
      this.battlePiece = null;
      this.detachedPieces = [];
      this.playerBullets = [];
      this.enemies = [];
      this.bossSpawned = false;
      this.bossDying = false;
      this.currentBoss = null;
      this.player.isDead = false;
      this.player.initInitialPiece();
      this.startTetrisPhase(); // 現在のステージ（2面など）のドッキングから再開！
    } else {
      this.sound.stopBGM();
      this.state = 'TITLE';
      this.stage = 1;
      this.selectedStage = 1; // ★ タイトルに戻ったら必ず STAGE 1 に戻す
      this.titleMenuSelection = 'START';
      this.score = 0;
      this.screenShake = 0;
      this.fallingPieces = [];
      this.battlePiece = null;
      this.detachedPieces = [];
      this.playerBullets = [];
      this.enemies = [];
      this.player.isDead = false;
      this.player.initInitialPiece();
    }
  }

  // ユーザー要望：ESCキーでポーズし「ゲームに戻る」「waveの最初から」「タイトルに戻る」の3択
  private handlePauseConfirm(input?: Input): void {
    this.sound.playHit();
    if (input) input.clearTransientInputs();

    if (this.pauseMenuSelection === 'RESUME') {
      this.state = 'PLAYING';
      this.sound.resumeBGM();
      if (this.bossWarningActive) {
        this.sound.playBossWarning();
      } else if (this.currentBoss && !this.currentBoss.isDead && !this.bossDying) {
        const lfoCategory = (this.currentBoss.rank === 'UFO_MOTHERSHIP' || this.currentBoss.rank === 'SPACE_SERPENT_HEAD') ? 1 : 2;
        this.sound.startBossLfo(lfoCategory);
      }
    } else if (this.pauseMenuSelection === 'RESTART_STAGE') {
      this.sound.stopBossLfo();
      this.sound.stopBossWarning();
      this.bossWarningActive = false;
      this.bossWarningTimer = 0;
      this.playerDeathSoundPlayed = false;
      this.deathDelay = 0;
      this.state = 'PLAYING';
      this.screenShake = 0;
      this.fallingPieces = [];
      this.battlePiece = null;
      this.detachedPieces = [];
      this.playerBullets = [];
      this.enemies = [];
      this.bossSpawned = false;
      this.bossDying = false;
      this.currentBoss = null;
      this.player.isDead = false;
      this.player.initInitialPiece();
      this.stage = this.selectedStage; // 選択したSTAGEからリスタート！
      this.startTetrisPhase();
    } else if (this.pauseMenuSelection === 'TITLE') {
      this.sound.stopBGM();
      this.sound.stopBossLfo();
      this.sound.stopBossWarning();
      this.bossWarningActive = false;
      this.bossWarningTimer = 0;
      this.playerDeathSoundPlayed = false;
      this.deathDelay = 0;
      this.state = 'TITLE';
      this.stage = 1;
      this.selectedStage = 1; // ★ タイトルに戻ったら必ず STAGE 1 に戻す
      this.titleMenuSelection = 'START';
      this.score = 0;
      this.screenShake = 0;
      this.fallingPieces = [];
      this.battlePiece = null;
      this.detachedPieces = [];
      this.playerBullets = [];
      this.enemies = [];
      this.player.isDead = false;
      this.player.initInitialPiece();
    }
  }

  // タイトル画面へ戻る（クリア画面・ポーズ・ゲームオーバーから共通）
  private returnToTitle(): void {
    this.sound.stopBGM();
    this.sound.stopBossLfo();
    this.sound.stopBossWarning();
    this.bossWarningActive = false;
    this.bossWarningTimer = 0;
    this.playerDeathSoundPlayed = false;
    this.deathDelay = 0;
    this.state = 'TITLE';
    this.stage = 1;
    this.selectedStage = 1;
    this.titleMenuSelection = 'START';
    this.score = 0;
    this.screenShake = 0;
    this.fallingPieces = [];
    this.battlePiece = null;
    this.detachedPieces = [];
    this.playerBullets = [];
    this.enemies = [];
    this.fieldItems = [];
    this.player.barrierTimer = 0;
    this.player.barrierFrozen = false;
    this.bossSpawned = false;
    this.bossDying = false;
    this.currentBoss = null;
    this.player.isDead = false;
    this.player.initInitialPiece();
  }

  // ★ ユーザー要望：Oミノだけになった時の救済テトリミノ投下
  private spawnRescuePiece(): void {
    const candidateTypes: TetrominoType[] = ['T', 'L', 'J', 'I', 'S', 'Z'];
    const pType = candidateTypes[Math.floor(Math.random() * candidateTypes.length)];
    const piece = new TetrominoPiece(pType);
    const rots = Math.floor(Math.random() * 4);
    for (let r = 0; r < rots; r++) piece.rotate();

    // 自機の横位置付近に投下
    let spawnX = Math.max(60, Math.min(CANVAS_WIDTH - 140, this.player.anchorX + (Math.random() - 0.5) * 80));
    // ★ ユーザー要望：5面・9面（地形が厳しい面）は壁に紛れやすいので、画面中央付近に投下する
    const centerDrop = this.stage === 5 || this.stage === 9;
    if (centerDrop) {
      spawnX = CANVAS_WIDTH / 2 - BLOCK_SIZE * 1.5 + (Math.random() - 0.5) * 40;
    }
    // ★ ユーザー要望：このステージで最初の1つは必ず画面中央の一番上から、ブレなく落とす
    const isFirstOfStage = this.rescueSpawnCount === 0;
    if (isFirstOfStage) {
      spawnX = CANVAS_WIDTH / 2 - BLOCK_SIZE * 1.5;
    }
    this.rescueSpawnCount++;
    // 中央投下の面は横ドリフトなしでまっすぐ落とす（従来は±35px/sの横流れで落下中に大きくずれていた）
    const driftVx = (centerDrop || isFirstOfStage) ? 0 : (Math.random() > 0.5 ? 1 : -1) * 35;

    this.battlePiece = {
      index: 0,
      piece,
      x: spawnX,
      y: -45,
      vx: driftVx,
      vy: 72, // ★ 55→72（約3割アップ）
      gx: Math.round(spawnX / BLOCK_SIZE),
      gy: -2,
      settled: false,
      fallTimer: 0,
    };

    this.sound.playPhaseAlert('tetris');
    this.showTransitionText('RESCUE DOCKING!', 1.2);
  }

  // 要望③：Oミノから切り離されたパーツを浮遊物として戦場に放出し、再回収可能にする
  private spawnDetachedFloatingPieces(detachedList: { piece: TetrominoPiece; relGx: number; relGy: number }[]): void {
    const baseGx = Math.round(this.player.anchorX / BLOCK_SIZE);
    const baseGy = Math.round(this.player.anchorY / BLOCK_SIZE);

    for (const d of detachedList) {
      const px = (baseGx + d.relGx) * BLOCK_SIZE;
      const py = (baseGy + d.relGy) * BLOCK_SIZE;

      this.detachedPieces.push({
        piece: d.piece,
        x: px,
        y: py,
        vx: (Math.random() - 0.5) * 60, // 左右にふわふわドリフト
        vy: 35 + Math.random() * 25, // ゆっくり下へ落下
        lifeTime: 0,
      });

      this.particles.emitSparks(px + BLOCK_SIZE, py + BLOCK_SIZE, d.piece.color, 16);
    }
  }

  // ==========================================
  // 描画
  // ==========================================
  public draw(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.save();
    if (this.screenShake > 0) {
      // ★ 性能：小数だけずらすと、以降に描く全ての矩形が
      //   「整数ピクセルの高速塗り」から「アンチエイリアス付きの低速経路」に落ちる。
      //   整数に丸めれば速いうえ、ドット絵の輪郭もボケない（レトロ感としてもこちらが正しい）。
      const shakeX = Math.round((Math.random() - 0.5) * this.screenShake);
      const shakeY = Math.round((Math.random() - 0.5) * this.screenShake);
      ctx.translate(shakeX, shakeY);
    }

    // 1. 豪華な渦巻き銀河・星雲・多層スターフィールド
    this.starfield.draw(ctx);

    // ★ 要望②：洞窟・狭窄地形の描画（グラディウス・サラマンダー風岩肌）
    this.terrain.draw(ctx);

    // 2. パズルフェーズ：自律浮遊・回転中の落下ブロック
    if (this.phase === 'TETRIS') {
      for (const item of this.fallingPieces) {
        if (item.settled) continue;

        for (const cell of item.piece.cells) {
          const px = item.x + cell.gx * BLOCK_SIZE;
          const py = item.y + cell.gy * BLOCK_SIZE;
          const gun = item.piece.getGunPortForCell(cell.gx, cell.gy);
          item.piece.drawCell(ctx, px, py, undefined, 1.0, gun.hasGun, gun.angle);
        }

        // ガイド用の淡い光彩枠
        const bounds = item.piece.getBoundingBox(item.x, item.y);
        ctx.save();
        ctx.strokeStyle = item.piece.color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(bounds.minX - 2, bounds.minY - 2, bounds.maxX - bounds.minX + 4, bounds.maxY - bounds.minY + 4);
        ctx.restore();

        // ★ ドッキングゴーストプレビュー（確定前に自機上のどこにハマるかをリアルタイム投影！）
        const cand = this.player.findBestDockCandidate(item.piece, item.x, item.y);
        if (cand && cand.dist < BLOCK_SIZE * 5) {
          this.player.drawDockGhost(ctx, item.piece, cand.relGx, cand.relGy);

          // ピース中心からゴースト中心への誘導点線ライン
          ctx.save();
          ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo((bounds.minX + bounds.maxX) / 2, bounds.maxY);
          ctx.lineTo(cand.candPx + BLOCK_SIZE, cand.candPy);
          ctx.stroke();
          ctx.restore();
        }
      }

    } else if (this.phase === 'SHOOTING') {
      // ★ ユーザー要望：Oミノ救済テトリミノの描画＆「DOCKING!」の誘導表示
      if (this.battlePiece && !this.battlePiece.settled) {
        for (const cell of this.battlePiece.piece.cells) {
          const px = this.battlePiece.x + cell.gx * BLOCK_SIZE;
          const py = this.battlePiece.y + cell.gy * BLOCK_SIZE;
          const gun = this.battlePiece.piece.getGunPortForCell(cell.gx, cell.gy);
          this.battlePiece.piece.drawCell(ctx, px, py, undefined, 1.0, gun.hasGun, gun.angle);
        }

        const bounds = this.battlePiece.piece.getBoundingBox(this.battlePiece.x, this.battlePiece.y);
        ctx.save();
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(bounds.minX - 2, bounds.minY - 2, bounds.maxX - bounds.minX + 4, bounds.maxY - bounds.minY + 4);
        ctx.restore();

        // ★ ドッキングゴーストプレビュー（戦闘中）
        const cand = this.player.findBestDockCandidate(this.battlePiece.piece, this.battlePiece.x, this.battlePiece.y);
        if (cand && cand.dist < BLOCK_SIZE * 5) {
          this.player.drawDockGhost(ctx, this.battlePiece.piece, cand.relGx, cand.relGy);
        }

        const dockBlink = Math.sin(Date.now() / 150) > -0.2;
        if (dockBlink) {
          drawMoonCrestaText(ctx, 'DOCKING!', (bounds.minX + bounds.maxX) / 2, bounds.minY - 14, 18, '#ffff00');
        }
      }
    }

    // ★ 要望③：切断されて浮遊・落下中のパーツ描画（点滅しながら落下、発射口も表示）
    for (const dp of this.detachedPieces) {
      const alpha = Math.sin(dp.lifeTime * 8) > 0 ? 0.9 : 0.5;
      for (const cell of dp.piece.cells) {
        const px = dp.x + cell.gx * BLOCK_SIZE;
        const py = dp.y + cell.gy * BLOCK_SIZE;
        const gun = dp.piece.getGunPortForCell(cell.gx, cell.gy);
        dp.piece.drawCell(ctx, px, py, undefined, alpha, gun.hasGun, gun.angle);
      }
    }

    // ★ フィールドアイテム描画（バリアオーブ・救済カプセル）
    for (const item of this.fieldItems) {
      item.draw(ctx);
    }

    // 3. 自機
    if (!this.player.isDead) {
      this.player.draw(ctx);
    }

    // 4. プレイヤー極太弾
    for (const bullet of this.playerBullets) {
      bullet.draw(ctx);
    }

    // 5. 敵大編隊（倍サイズ・原色ピクセルエイリアン）
    for (const enemy of this.enemies) {
      enemy.draw(ctx);
    }

    // 6. パーティクル
    this.particles.draw(ctx);

    // 7. フェーズ切り替えバナー（STAGE開始時は超巨大サイズで迫力満点！）
    if (this.transitionAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.transitionAlpha);
      const isStageBanner = this.transitionText.startsWith('STAGE');
      const isWarningBanner = this.transitionText.includes('WARNING');
      const boxHeight = isStageBanner ? 130 : (isWarningBanner ? 105 : 90);
      ctx.fillStyle = isWarningBanner ? 'rgba(35, 0, 5, 0.88)' : 'rgba(0, 0, 0, 0.82)';
      ctx.fillRect(0, CANVAS_HEIGHT / 2 - boxHeight / 2, CANVAS_WIDTH, boxHeight);

      if (isWarningBanner) {
        // 上下に警告ストロボ枠線
        ctx.strokeStyle = Math.sin(Date.now() * 0.02) > 0 ? '#ff1100' : '#ffea00';
        ctx.lineWidth = 3;
        ctx.strokeRect(0, CANVAS_HEIGHT / 2 - boxHeight / 2, CANVAS_WIDTH, boxHeight);

        const fontSize = Math.floor(30 * this.transitionScale);
        ctx.font = `900 ${fontSize}px "Impact", "Arial Black", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ff2200';
        ctx.shadowColor = '#ff6600';
        ctx.shadowBlur = 20;
        ctx.fillText(this.transitionText, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.strokeText(this.transitionText, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      } else if (isStageBanner) {
        // ムーンクレスタ風：シンプルな白文字ステージ表示
        const fontSize = Math.floor(40 * this.transitionScale);
        ctx.font = `900 ${fontSize}px "DotGothic16", "Courier New", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 8;
        ctx.fillText(this.transitionText, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      } else {
        const fontSize = Math.floor(28 * this.transitionScale);
        ctx.font = `900 ${fontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = this.phase === 'TETRIS' ? '#00ffaa' : '#ff3366';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 14;
        ctx.fillText(this.transitionText, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      }
      ctx.restore();
    }

    // ゲーム内描画の終了：screenShakeの揺れをここで解除（メニューやHUD、オーバーレイに揺れを絶対に波及させない）
    ctx.restore();

    // 8. プレイ中のHUD（STAGE & SCORE）：Canvas直描画によりCRT走査線・歪み・グローと完全融合
    if (this.state === 'PLAYING') {
      this.drawArcadeHUD(ctx);
    }

    // 9. タイトル・ゲームオーバーオーバーレイ（画面揺れの影響を一切受けない）
    this.drawOverlays(ctx);

    // 10. スマホ用 指位置レティクルの表示（触れている間のみ）
    this.drawVirtualStick(ctx);

    // 10.5 アプリ内ブラウザ（タッチイベントが届かない環境）への案内
    if (this.lastInput && this.lastInput.isClickOnlyEnvironment()) {
      ctx.save();
      // 背景の星や地形に負けないよう、薄い帯を敷いてから文字を置く
      ctx.fillStyle = 'rgba(0, 6, 18, 0.82)';
      ctx.fillRect(0, 74, CANVAS_WIDTH, 62);
      ctx.strokeStyle = 'rgba(255, 204, 51, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 74.5, CANVAS_WIDTH - 1, 61);
      ctx.textAlign = 'center';
      ctx.font = 'bold 13px "DotGothic16", monospace';
      ctx.fillStyle = '#ffcc33';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      ctx.fillText('この環境ではタッチ操作が届いていません', CANVAS_WIDTH / 2, 92);
      ctx.fillText('Safari で開き直すと快適に遊べます', CANVAS_WIDTH / 2, 110);
      ctx.fillStyle = '#9fe8ff';
      ctx.fillText('（今は 左半分タップ＝移動 ／ 右半分タップ＝ショット）', CANVAS_WIDTH / 2, 128);
      ctx.restore();
    }

    // 11. 入力診断表示。
    //   itch.io + iPhone の「タップが効かない」調査で使ったもの。
    //   普段は邪魔なので出さないが、
    //   ・URL に ?debug=1 が付いているとき
    //   ・入力経路が1つも見つからない異常時（タッチもポインタも届いていないとき）
    //   だけ自動で表示して、その場で原因が分かるようにしておく。
    if (this.shouldShowInputDiagnostics()) this.drawDeviceDebugLine(ctx);
  }

  /** 入力診断表示を出すべきか（普段は出さない） */
  private shouldShowInputDiagnostics(): boolean {
    if (this.debugQueryForced === null) {
      let forced = false;
      try {
        forced = /[?&#]debug(=1)?\b/.test(window.location.search + window.location.hash);
      } catch {
        forced = false;
      }
      this.debugQueryForced = forced;
    }
    if (this.debugQueryForced) return true;
    // 異常時のみ：操作が始まっているのに、タッチもポインタも1件も届いていない
    const input = this.lastInput;
    return !!input && input.evtClick > 0 && input.evtTouch === 0 && input.evtDown === 0;
  }

  /**
   * ★ スマホ単体で原因を切り分けるための極小デバッグ表示（タイトル画面だけ）。
   *   BUILD が古ければキャッシュ問題、D(=pointerdown) などが 0 のままなら
   *   そもそもタップがゲームに届いていない、と一目で判断できる。
   */
  private drawDeviceDebugLine(ctx: CanvasRenderingContext2D): void {
    const input = this.lastInput;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowBlur = 0;
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = 'rgba(140, 175, 205, 0.9)';
    ctx.fillText(`BUILD ${typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : '?'}`, CANVAS_WIDTH / 2, 694);
    if (input) {
      ctx.fillText(
        `D${input.evtDown} M${input.evtMove} U${input.evtUp} X${input.evtCancel} ` +
        `T${input.evtTouch} C${input.evtClick} ${input.srcTag} ` +
        `${input.lastEventLabel} R${input.canvasRectLabel()}`,
        CANVAS_WIDTH / 2,
        710
      );
    }
    ctx.restore();
  }

  /**
   * ★ 非常用の代替操作：ネイティブ click しか届かない環境（Facebook / X / LINE などの
   *   アプリ内ブラウザ）でも最低限遊べるようにする。
   *   実測で touchstart も pointerdown も一切届かないため、仮想スティックが成立しない。
   *   そこで「左半分タップ＝その位置まで自機が移動」「右半分タップ＝短く連射」に切り替える。
   *   通常のスマホ／PCでは isClickOnlyEnvironment() が成立しないので一切影響しない。
   */
  private applyClickOnlyControls(dt: number, input: Input): void {
    if (this.clickFireTimer > 0) this.clickFireTimer -= dt;

    if (!input.isClickOnlyEnvironment()) {
      input.pendingClickX = null;
      input.pendingClickY = null;
      return;
    }

    if (input.pendingClickX !== null && input.pendingClickY !== null) {
      if (input.pendingClickX < CANVAS_WIDTH / 2) {
        // 左半分：移動先を指定（弾は出さない）
        this.clickMoveTargetX = input.pendingClickX;
        this.clickMoveTargetY = input.pendingClickY;
      } else {
        // 右半分：短く連射
        this.clickFireTimer = 0.35;
      }
      input.pendingClickX = null;
      input.pendingClickY = null;
    }

    // 指定位置への移動は Player 側のポインティング移動（movementInput）に任せる。
    // 到達したら目標を解除して、その場に止まるようにする
    if (this.clickMoveTargetX !== null && this.clickMoveTargetY !== null) {
      const c = this.player.getBarrierCenter();
      if (Math.hypot(this.clickMoveTargetX - c.x, this.clickMoveTargetY - c.y) < 8) {
        this.clickMoveTargetX = null;
        this.clickMoveTargetY = null;
      }
    }
  }

  /**
   * ★ ユーザー要望（スマホ）：落下中のテトリミノを直接タッチすると、回転＋ノックバック。
   *   PC のように「どこに当たったかで回転方向が変わる」テクニカル要素は入れず、
   *   触れたら必ず時計回りに1回転・真上へ反動、という分かりやすい操作にする。
   *   指は細かく狙えないので、外接矩形に少し余裕（TOUCH_PAD）を持たせる。
   *   @returns このタップをミノ操作として消費したか（true なら自機は動かず弾も出ない）
   */
  private tryTouchRotatePiece(x: number, y: number): boolean {
    if (this.state !== 'PLAYING') return false;

    const TOUCH_PAD = 20;
    const hits = (bx: { minX: number; maxX: number; minY: number; maxY: number }): boolean =>
      x >= bx.minX - TOUCH_PAD && x <= bx.maxX + TOUCH_PAD &&
      y >= bx.minY - TOUCH_PAD && y <= bx.maxY + TOUCH_PAD;

    // ★ ドッキングフェーズ：3つの落下テトリミノ。ここが本来の「ミノを回して組む」場面。
    //   以前はここに実装が無く、スマホでタップしても何も起きなかった。
    if (this.phase === 'TETRIS') {
      // 手前（下にあるもの）から優先して拾う
      const candidates = this.fallingPieces.filter(it => !it.settled);
      candidates.sort((a, b) => b.y - a.y);
      for (const item of candidates) {
        if (!hits(item.piece.getBoundingBox(item.x, item.y))) continue;
        // 弾を当てたときと同じ手応え（当てるたびに反動が強くなる）を、タップでも再現する
        item.hitCount = (item.hitCount || 0) + 1;
        const mul = Math.min(4.0, 1 + item.hitCount * 0.24);
        item.piece.rotate();
        item.vy = -140 * mul; // 真上へノックバック
        item.vx *= 0.5;
        item.dockCooldown = 0.4;
        this.particles.emitSparks(x, y, item.piece.color, 14);
        this.sound.playHit();
        return true;
      }
      return false;
    }

    // ★ シューティングフェーズ：レスキューで落ちてくるミノ
    const bp = this.battlePiece;
    if (!bp || bp.settled) return false;
    if (!hits(bp.piece.getBoundingBox(bp.x, bp.y))) return false;

    bp.piece.rotate();
    bp.vy = -150; // 真上へノックバック
    bp.dockCooldown = 0.4;
    this.particles.emitSparks(x, y, bp.piece.color, 14);
    this.sound.playHit();
    return true;
  }

  /**
   * ★ ユーザー要望：どの面でも、ボスを倒したら残っているザコはつられて連鎖爆破する。
   *   以前は弾で倒したときだけの処理だったので、バリアで焼き切った場合と
   *   体当たりで倒した場合はザコが残ったままになっていた。
   */
  private chainExplodeRemainingZako(boss: Enemy): void {
    let chainDelay = 0;
    for (const z of this.enemies) {
      if (z.isDead || z === boss) continue;
      z.isDead = true;
      chainDelay += 0.04;
      window.setTimeout(() => {
        this.sound.playEnemyPop(z.rank);
        this.particles.emitExplosion(z.x + z.width / 2, z.y + z.height / 2, '#ffaa00', 18, false);
      }, chainDelay * 1000);
      this.score += z.scoreValue;
    }
  }

  /**
   * ★ フィールドアイテム（バリアオーブ）の移動と取得判定。
   *   ★ ユーザー要望：クリア後のドッキング中もオーブは流れ続け、取ればバリアが張れる。
   *     以前はシューティング中しか更新していなかったため、ドッキング画面でその場に静止し、
   *     取ることもできず、次ステージ開始時に消えてしまっていた。
   *   バリアの残り時間は Player.barrierFrozen で止めてあるので、
   *   ドッキング中に取ってもステージが始まるまでカウントは進まない。
   */
  private updateFieldItems(dt: number): void {
    const scrollSpeed = 140 * (this.stage === 5 ? 4 / 9 : 1); // 5面は地形と同じく4/9速
    for (let i = this.fieldItems.length - 1; i >= 0; i--) {
      const item = this.fieldItems[i];
      item.update(dt, scrollSpeed, this.terrain.direction);

      // 自機との当たり判定
      const playerBounds = this.player.getBoundingBox();
      const pCenterX = (playerBounds.minX + playerBounds.maxX) / 2;
      const pCenterY = (playerBounds.minY + playerBounds.maxY) / 2;
      const dist = Math.hypot(item.x - pCenterX, item.y - pCenterY);

      if (dist < item.radius + 28) {
        item.isDead = true;
        // ★ ユーザー要望：Arcade-Shooter01-6(Score) アイテム取得音
        this.sound.playItemScore();
        this.particles.emitDockRing(item.x, item.y, '#00ffff');

        if (item.type === 'BARRIER_ORB') {
          // ★ ユーザー要望：5秒間の完全無敵レインボーバリア展開！
          //   バリアが出ているのは見れば分かるのでインフォ表示はしない。
          //   transitionText は1枠しかなく、ここで出すと
          //   「WARNING: BOSS APPROACHING」を上書きして消してしまっていた
          this.player.barrierTimer = 5.0;
          this.score += 1000;
        } else if (item.type === 'RESCUE_CAPSULE') {
          // 緊急救済テトリミノを即時投下
          this.spawnRescuePiece();
          this.score += 800;
        }
      }

      if (item.isDead) {
        this.fieldItems.splice(i, 1);
      }
    }
  }

  /**
   * ★ Player.updateMovement に渡す入力。
   *   スマホ（タッチ）は指の座標へのポインティング移動、
   *   click しか届かない環境はタップ位置へのポインティング移動、
   *   PC はキーボードのみ（ポインティングなし）。
   */
  private movementInput(input: Input): {
    left: boolean; right: boolean; up: boolean; down: boolean;
    mouseX?: number | null; mouseY?: number | null;
    dragDX?: number; dragDY?: number;
    pointX?: number | null; pointY?: number | null;
  } {
    // ★ スマホ：指を動かした分だけ自機も動く（相対移動）。
    //   click しか届かない環境だけは、タップ位置へ寄っていく絶対移動のままにする
    let pointX: number | null = null;
    let pointY: number | null = null;
    if (!input.touchPointActive && this.clickMoveTargetX !== null && this.clickMoveTargetY !== null) {
      pointX = this.clickMoveTargetX;
      pointY = this.clickMoveTargetY;
    }
    return {
      left: input.left,
      right: input.right,
      up: input.up,
      down: input.down,
      mouseX: input.mouseX,
      mouseY: input.mouseY,
      dragDX: input.moveDeltaX,
      dragDY: input.moveDeltaY,
      pointX,
      pointY,
    };
  }

  /** ★ スマホ操作：指の位置に照準レティクルを描く（ポインティング移動の目印） */
  private drawVirtualStick(ctx: CanvasRenderingContext2D): void {
    const input = this.lastInput;
    if (!input || !input.stickActive || this.state !== 'PLAYING') return;

    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = '#00ffcc';
    ctx.lineWidth = 2;

    // 指の位置の二重リング
    ctx.beginPath();
    ctx.arc(input.stickKnobX, input.stickKnobY, 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(input.stickKnobX, input.stickKnobY, 13, 0, Math.PI * 2);
    ctx.stroke();

    // 十字線
    ctx.beginPath();
    ctx.moveTo(input.stickKnobX - 38, input.stickKnobY);
    ctx.lineTo(input.stickKnobX - 18, input.stickKnobY);
    ctx.moveTo(input.stickKnobX + 18, input.stickKnobY);
    ctx.lineTo(input.stickKnobX + 38, input.stickKnobY);
    ctx.moveTo(input.stickKnobX, input.stickKnobY - 38);
    ctx.lineTo(input.stickKnobX, input.stickKnobY - 18);
    ctx.moveTo(input.stickKnobX, input.stickKnobY + 18);
    ctx.lineTo(input.stickKnobX, input.stickKnobY + 38);
    ctx.stroke();

    ctx.restore();
  }

  /** ハイスコア保存（更新があればlocalStorageへ永続化） */
  // ★ ザコ撃破をカウントし、累計が閾値を超えるたびにバリアオーブを画面外（スクロールの進行方向側）から流し込む
  private registerZakoKill(): void {
    this.totalKills++;
    if (this.totalKills >= this.nextBarrierKills) {
      this.nextBarrierKills += this.barrierKillInterval();
      this.spawnBarrierOrb();
    }
  }

  private spawnBarrierOrb(): void {
    const dir = this.terrain.direction;
    let x = CANVAS_WIDTH * 0.5;
    let y = -60;
    if (dir === 'RIGHT') {
      x = CANVAS_WIDTH + 60;
      y = CANVAS_HEIGHT * (0.3 + Math.random() * 0.4);
    } else if (dir === 'LEFT') {
      x = -60;
      y = CANVAS_HEIGHT * (0.3 + Math.random() * 0.4);
    } else if (dir === 'DIAGONAL_UP_RIGHT') {
      // 5面も「上から降ってくる」扱い（Item.update 側と揃える）
      x = CANVAS_WIDTH * (0.3 + Math.random() * 0.4);
      y = -60;
    } else {
      x = CANVAS_WIDTH * (0.3 + Math.random() * 0.4);
    }
    this.fieldItems.push(new FieldItem(x, y, 'BARRIER_ORB'));
    // ★ 同上：ボスのWARNING表示を潰さないよう、オーブ出現のインフォ表示もしない（音だけ鳴らす）
    this.sound.playItemScore();
  }

  // ★ ユーザー要望：SCORE の下にそれまでの最高得点を常時表示。新記録なら「HIGH SCORE!!」を点滅
  private drawScoreWithHigh(ctx: CanvasRenderingContext2D, y: number): void {
    const isNewHigh = this.score > 0 && this.score > this.runStartHighScore;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#ffee00';
    ctx.shadowBlur = 0;
    ctx.fillText(`SCORE: ${this.score}`, CANVAS_WIDTH / 2, y);
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#88ddff';
    ctx.fillText(`HIGH SCORE: ${this.highScore}`, CANVAS_WIDTH / 2, y + 30);
    if (isNewHigh && Math.floor(Date.now() / 220) % 2 === 0) {
      ctx.font = '900 22px monospace';
      ctx.fillStyle = '#ff3366';
      ctx.shadowColor = '#ff3366';
      ctx.shadowBlur = 14;
      ctx.fillText('★ HIGH SCORE!! ★', CANVAS_WIDTH / 2, y - 32);
    }
    ctx.restore();
  }

  private saveHighScore(): void {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      try { localStorage.setItem('galaxtris_hiscore', String(this.highScore)); } catch {}
    }
  }

  private drawArcadeHUD(ctx: CanvasRenderingContext2D): void {
    // 毎フレームハイスコアをリアルタイム更新
    if (this.score > this.highScore) {
      this.highScore = this.score;
    }

    ctx.save();
    ctx.textBaseline = 'top';
    const hudFont = '900 20px "DotGothic16", "Courier New", monospace';
    const numFont = '900 24px "DotGothic16", "Courier New", monospace';
    const cyanColor = '#00f0ff';

    // ── 左上: 1'ST (スコア) ──
    ctx.textAlign = 'left';
    // ラベル: 水色
    ctx.font = hudFont;
    ctx.shadowColor = cyanColor;
    ctx.shadowBlur = 10;
    ctx.fillStyle = cyanColor;
    ctx.fillText("1'ST", 16, 8);
    ctx.shadowBlur = 0;
    // 数値: 真っ白
    ctx.font = numFont;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 6;
    ctx.fillText(`${this.score}`, 16, 28);
    ctx.shadowBlur = 0;

    // ── 中央上: HI-SCORE ──
    ctx.textAlign = 'center';
    // ラベル: 水色
    ctx.font = hudFont;
    ctx.shadowColor = cyanColor;
    ctx.shadowBlur = 10;
    ctx.fillStyle = cyanColor;
    ctx.fillText('HI-SCORE', CANVAS_WIDTH / 2, 8);
    ctx.shadowBlur = 0;
    // 数値: 真っ白
    ctx.font = numFont;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 6;
    ctx.fillText(`${this.highScore}`, CANVAS_WIDTH / 2, 28);
    ctx.shadowBlur = 0;

    // 撮影用無敵モードインジケータ
    if (this.isInvincibleMode) {
      ctx.font = '900 13px "DotGothic16", monospace';
      ctx.fillStyle = '#ffea00';
      ctx.shadowColor = '#ffea00';
      ctx.shadowBlur = 6;
      ctx.fillText('★ INVINCIBLE (無敵) ★', CANVAS_WIDTH / 2, 54);
      ctx.shadowBlur = 0;
    }

    // ── 右上: モバイル・マウス向け MUTE & PAUSE ボタン ──
    // MUTE (x: 440..476, y: 10..42)
    ctx.fillStyle = 'rgba(20, 30, 48, 0.7)';
    ctx.strokeStyle = '#304560';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(440, 10, 36, 32, 6);
    else ctx.rect(440, 10, 36, 32);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '16px "Segoe UI Emoji", "Apple Color Emoji", monospace';
    ctx.fillStyle = this.sound.isMuted ? '#ff4466' : '#00ffcc';
    ctx.fillText(this.sound.isMuted ? '🔇' : '🔊', 458, 26);

    // PAUSE (x: 486..522, y: 10..42)
    // ★ ユーザー要望：ESCの代わりのボタンが分かりづらいので目立たせる。
    //   明るい枠＋発光、二本線のポーズ記号を自前で描き（絵文字はOSによって細く沈む）、
    //   下に小さく「PAUSE」と添えて用途が一目で分かるようにした。
    ctx.fillStyle = 'rgba(0, 60, 90, 0.92)';
    ctx.strokeStyle = '#ffea00';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ffea00';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(486, 10, 36, 32, 6);
    else ctx.rect(486, 10, 36, 32);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // ポーズ記号（二本の縦棒）を自前描画
    ctx.fillStyle = '#ffea00';
    ctx.shadowColor = '#ffea00';
    ctx.shadowBlur = 6;
    ctx.fillRect(497, 17, 4, 13);
    ctx.fillRect(507, 17, 4, 13);
    ctx.shadowBlur = 0;

    // ボタンの下に用途ラベル
    ctx.font = 'bold 8px monospace';
    ctx.fillStyle = '#ffea00';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('PAUSE', 504, 44);
    ctx.textBaseline = 'top';

    // ── テトリスフェーズ中: ムーンクレスタ忠実再現 ──
    // 原作と同じく「レバーとボタンでドッキングせよ」＋タイマーを中央に控えめに表示
    if (this.phase === 'TETRIS' && this.state === 'PLAYING') {
      const hasFallingPiece = this.fallingPieces.some(p => !p.settled);

      if (hasFallingPiece) {
        // 「レバーとボタンでドッキングせよ」— ムーンクレスタ原作通り水色・太字・大きめサイズ・中央
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = '900 24px "DotGothic16", "Courier New", monospace';
        ctx.fillStyle = '#00f0ff';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 10;
        ctx.fillText('レバーとボタンでドッキングせよ', CANVAS_WIDTH / 2, 126);
        ctx.shadowBlur = 0;

        // タイマー（原作通り「27: 0」形式、白文字・中央、ドッキングせよの直下）
        const sec = Math.floor(this.dockingTimer);
        const dec = Math.floor((this.dockingTimer - sec) * 10);
        const timerStr = `${sec}: ${dec}`;
        ctx.font = '900 22px "DotGothic16", "Courier New", monospace';
        // 残り10秒以下で赤く警告（原作リスペクトの緊張感）
        if (this.dockingTimer <= 10) {
          ctx.fillStyle = '#ff2244';
          ctx.shadowColor = '#ff0033';
          ctx.shadowBlur = 4;
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = '#ffffff';
          ctx.shadowBlur = 2;
        }
        ctx.fillText(timerStr, CANVAS_WIDTH / 2, 158);
        ctx.shadowBlur = 0;
      }
    }

    ctx.restore();
  }

  private drawOverlays(ctx: CanvasRenderingContext2D): void {
    if (this.state === 'TITLE') {
      ctx.save();
      ctx.fillStyle = 'rgba(2, 4, 8, 0.92)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // 右上 MUTE ボタン
      ctx.fillStyle = 'rgba(20, 30, 48, 0.7)';
      ctx.strokeStyle = '#304560';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(486, 10, 36, 32, 6);
      else ctx.rect(486, 10, 36, 32);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '16px "Segoe UI Emoji", "Apple Color Emoji", monospace';
      ctx.fillStyle = this.sound.isMuted ? '#ff4466' : '#00ffcc';
      ctx.fillText(this.sound.isMuted ? '🔇' : '🔊', 504, 26);
      ctx.textBaseline = 'top';

      // 1. 凝ったメインロゴ（Galaxtris ＋ ギャラクトリス）
      this.drawCoolTitleLogo(ctx, CANVAS_WIDTH / 2, 210);

      // 2. 超シンプルで簡潔な説明文
      ctx.textAlign = 'center';
      ctx.font = 'bold 15px "DotGothic16", "Courier New", monospace';
      ctx.fillStyle = '#00ffcc';
      ctx.shadowColor = '#00ffcc';
      ctx.shadowBlur = 8;
      ctx.fillText('ブロックを合体して全方位ビームでエイリアンを撃破せよ！', CANVAS_WIDTH / 2, 390);

      // ★ ユーザー要望：上から START / 難易度 / ステージセレクト の3行。
      //   最初のカーソルは START に合っている（難易度の初期値は NORMAL）。
      const ROW = GameManager.TITLE_ROW_Y;
      const ROW_H = GameManager.TITLE_ROW_H;
      const sel = this.titleMenuSelection;

      // ★ 選択中の行にだけ四角枠を表示
      const drawSelectFrame = (y: number, h: number, w = 380) => {
        ctx.fillStyle = 'rgba(0, 40, 80, 0.45)';
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 1.2;
        ctx.shadowBlur = 0;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(CANVAS_WIDTH / 2 - w / 2, y, w, h, 8);
        else ctx.rect(CANVAS_WIDTH / 2 - w / 2, y, w, h);
        ctx.fill();
        ctx.stroke();
      };

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 2. START（画面中央あたり・初期カーソル位置・大きな文字）
      if (sel === 'START') drawSelectFrame(ROW.START, ROW_H.START, 500);
      const blink = Math.sin(Date.now() / 250) > 0;
      ctx.font = '900 26px monospace';
      if (sel === 'START' && blink) {
        ctx.fillStyle = '#ffea00';
        ctx.shadowColor = '#ffea00';
        ctx.shadowBlur = 12;
      } else if (sel === 'START') {
        ctx.fillStyle = '#8a7a20';
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = '#667788';
        ctx.shadowBlur = 0;
      }
      ctx.fillText(
        sel === 'START' ? '\u25b6 TAP OR PRESS TO START \u25c0' : '  TAP OR PRESS TO START  ',
        CANVAS_WIDTH / 2,
        ROW.START + ROW_H.START / 2
      );
      ctx.shadowBlur = 0;

      // 3. 難易度セレクター（EASY / NORMAL / HARD）
      if (sel === 'DIFFICULTY') drawSelectFrame(ROW.DIFFICULTY, ROW_H.DIFFICULTY, 516);
      ctx.font = '900 16px monospace';
      const diffEntries: { key: 'EASY' | 'NORMAL' | 'HARD'; label: string; x: number; color: string }[] = [
        { key: 'EASY', label: 'EASY', x: CANVAS_WIDTH / 2 - 168, color: '#44ff88' },
        { key: 'NORMAL', label: 'NORMAL', x: CANVAS_WIDTH / 2, color: '#00f0ff' },
        { key: 'HARD', label: 'HARD', x: CANVAS_WIDTH / 2 + 168, color: '#ff2255' },
      ];
      for (const d of diffEntries) {
        if (this.difficulty === d.key) {
          ctx.fillStyle = d.color;
          ctx.shadowColor = d.color;
          ctx.shadowBlur = 12;
          ctx.fillText(`\u25b6 [ ${d.label} ] \u25c0`, d.x, ROW.DIFFICULTY + ROW_H.DIFFICULTY / 2);
        } else {
          ctx.fillStyle = '#667788';
          ctx.shadowBlur = 0;
          ctx.fillText(`  [ ${d.label} ]  `, d.x, ROW.DIFFICULTY + ROW_H.DIFFICULTY / 2);
        }
      }
      ctx.shadowBlur = 0;

      // 4. 面セレクト（STAGE SELECT: ◀ STAGE [ X ] ▶）
      if (sel === 'STAGE') drawSelectFrame(ROW.STAGE, ROW_H.STAGE);
      ctx.font = '900 19px monospace';
      ctx.fillStyle = sel === 'STAGE' ? '#00ffff' : '#5599aa';
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = sel === 'STAGE' ? 10 : 0;
      ctx.fillText(
        sel === 'STAGE' ? `\u25c0  STAGE  [ ${this.selectedStage} ]  \u25b6` : `   STAGE  [ ${this.selectedStage} ]   `,
        CANVAS_WIDTH / 2,
        ROW.STAGE + ROW_H.STAGE / 2
      );
      ctx.textBaseline = 'alphabetic';
      ctx.shadowBlur = 0;

      // 5. 画面最下部に往年のNAMCO風「MUKKII」作者ロゴ！
      this.drawNamcoStyleMukkiiLogo(ctx, CANVAS_WIDTH / 2, 624);

      ctx.restore();
    } else if (this.state === 'PAUSED') {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 5, 16, 0.85)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.textAlign = 'center';
      ctx.font = '900 42px monospace';
      ctx.fillStyle = '#00f0ff';
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 18;
      ctx.fillText('PAUSE', CANVAS_WIDTH / 2, 260);

      ctx.font = 'bold 18px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 0;
      ctx.fillText(`CURRENT: STAGE ${this.stage}   SCORE: ${this.score}`, CANVAS_WIDTH / 2, 315);

      const isResume = this.pauseMenuSelection === 'RESUME';
      const isRestart = this.pauseMenuSelection === 'RESTART_STAGE';
      const isTitle = this.pauseMenuSelection === 'TITLE';

      // 2. ゲームに戻る (RESUME)
      ctx.font = '900 20px monospace';
      if (isResume) {
        ctx.fillStyle = '#ffff00';
        ctx.shadowColor = '#ffff00';
        ctx.shadowBlur = 12;
        ctx.fillText('> ゲームに戻る (RESUME) <', CANVAS_WIDTH / 2, 420);
      } else {
        ctx.fillStyle = '#888888';
        ctx.shadowBlur = 0;
        ctx.fillText('  ゲームに戻る (RESUME)  ', CANVAS_WIDTH / 2, 420);
      }

      // 3. STAGEの最初から (RESTART / WARP)
      if (isRestart) {
        ctx.fillStyle = '#ffff00';
        ctx.shadowColor = '#ffff00';
        ctx.shadowBlur = 12;
        // ★ 選択中は左右キー（◀ ▶）でSTAGEを切り替え、そのまま決定で開始
        ctx.fillText(`◀ STAGE ${this.selectedStage} を開始 (START STAGE ${this.selectedStage}) ▶`, CANVAS_WIDTH / 2, 470);
      } else {
        ctx.fillStyle = '#888888';
        ctx.shadowBlur = 0;
        ctx.fillText(`  STAGE ${this.selectedStage} を開始 (START STAGE ${this.selectedStage})  `, CANVAS_WIDTH / 2, 470);
      }

      // 4. タイトルに戻る (RETURN TO TITLE)
      if (isTitle) {
        ctx.fillStyle = '#ffff00';
        ctx.shadowColor = '#ffff00';
        ctx.shadowBlur = 12;
        ctx.fillText('> タイトルに戻る (TITLE) <', CANVAS_WIDTH / 2, 520);
      } else {
        ctx.fillStyle = '#888888';
        ctx.shadowBlur = 0;
        ctx.fillText('  タイトルに戻る (TITLE)  ', CANVAS_WIDTH / 2, 520);
      }

      // 5. 撮影用無敵モード切替表示
      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = this.isInvincibleMode ? '#ffea00' : '#778899';
      ctx.shadowColor = this.isInvincibleMode ? '#ffea00' : 'transparent';
      ctx.shadowBlur = this.isInvincibleMode ? 6 : 0;
      ctx.fillText(`★ 撮影用無敵モード: [ ${this.isInvincibleMode ? 'ON (有効)' : 'OFF (通常)'} ] (Iキー/タップ)`, CANVAS_WIDTH / 2, 565);

      ctx.shadowBlur = 0;
      ctx.font = '12px monospace';
      ctx.fillStyle = '#8b949e';
      ctx.fillText('▲/▼: 項目選択   ◀/▶: STAGE切替(開始行で)   SPACE/ENTER: 決定', CANVAS_WIDTH / 2, 605);
      ctx.restore();
    } else if (this.state === 'GAMEOVER') {
      ctx.save();
      ctx.fillStyle = 'rgba(20, 0, 0, 0.88)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.textAlign = 'center';
      ctx.font = '900 44px monospace';
      ctx.fillStyle = '#ff2244';
      ctx.shadowColor = '#ff0033';
      ctx.shadowBlur = 20;
      ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, 260);

      this.drawScoreWithHigh(ctx, 322);
      ctx.font = 'bold 18px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 0;
      ctx.fillText(`STAGE: ${this.stage} / ${MAX_STAGES}`, CANVAS_WIDTH / 2, 385);

      if (this.stateTimer <= 0) {
        const isContinue = this.gameOverSelection === 'CONTINUE';
        const isTitle = this.gameOverSelection === 'TITLE';

        // 1. CONTINUE 選択肢
        ctx.font = '900 24px monospace';
        if (isContinue) {
          ctx.fillStyle = '#ffff00';
          ctx.shadowColor = '#ffff00';
          ctx.shadowBlur = 12;
          ctx.fillText(`> CONTINUE (STAGE ${this.stage}) <`, CANVAS_WIDTH / 2, 475);
        } else {
          ctx.fillStyle = '#777777';
          ctx.shadowBlur = 0;
          ctx.fillText(`  CONTINUE (STAGE ${this.stage})  `, CANVAS_WIDTH / 2, 475);
        }

        // 2. RETURN TO TITLE 選択肢
        if (isTitle) {
          ctx.fillStyle = '#ffff00';
          ctx.shadowColor = '#ffff00';
          ctx.shadowBlur = 12;
          ctx.fillText('> RETURN TO TITLE <', CANVAS_WIDTH / 2, 535);
        } else {
          ctx.fillStyle = '#777777';
          ctx.shadowBlur = 0;
          ctx.fillText('  RETURN TO TITLE  ', CANVAS_WIDTH / 2, 535);
        }

        ctx.shadowBlur = 0;
        ctx.font = '14px monospace';
        ctx.fillStyle = '#8b949e';
        ctx.fillText('UP/DOWN: SELECT   SPACE / ENTER / CLICK: DECIDE', CANVAS_WIDTH / 2, 610);
      }
      ctx.restore();
    } else if (this.state === 'VICTORY') {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 20, 10, 0.85)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.textAlign = 'center';
      ctx.font = '900 40px monospace';
      ctx.fillStyle = '#00ffaa';
      ctx.shadowColor = '#00ffaa';
      ctx.shadowBlur = 25;
      ctx.fillText('ALL STAGES CLEAR!', CANVAS_WIDTH / 2, 280);

      ctx.font = 'bold 22px monospace';
      ctx.fillStyle = '#ffee00';
      ctx.fillText(`CONGRATULATIONS!`, CANVAS_WIDTH / 2, 330);
      this.drawScoreWithHigh(ctx, 400);

      if (this.stateTimer <= 0) {
        ctx.font = '16px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('PRESS SPACE TO RETURN TO TITLE', CANVAS_WIDTH / 2, 490);
      }
      ctx.restore();
    }
  }

  // かっこいいタイトルロゴ描画（超大型 Galaxtris ＋ 差をつけたリズミカルなカタカナ：ギャラクトリス）
  private drawCoolTitleLogo(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.save();

    // 1. 上部アクセント装飾
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.fillStyle = '#00ffff';
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 6;
    ctx.fillText('★ RETRO ARCADE FUSION ★', cx, cy - 82);

    // 2. 超ド級メインロゴ「Galaxtris」（一文字ずつサイズに差をつけてダイナミックなアーケードロゴ感を演出！）
    const engLetters = [
      { char: 'G', size: 84, yOffset: -2 },
      { char: 'a', size: 70, yOffset: 2 },
      { char: 'l', size: 78, yOffset: -1 },
      { char: 'a', size: 68, yOffset: 2 },
      { char: 'x', size: 74, yOffset: 0 },
      { char: 't', size: 70, yOffset: 1 },
      { char: 'r', size: 66, yOffset: 2 },
      { char: 'i', size: 64, yOffset: 3 },
      { char: 's', size: 72, yOffset: 0 },
    ];

    // 全体の横幅を計測して中央揃え
    ctx.textBaseline = 'middle';
    let totalEngWidth = 0;
    const letterWidths: number[] = [];
    for (const item of engLetters) {
      ctx.font = `900 ${item.size}px "Impact", "Arial Black", sans-serif`;
      const w = ctx.measureText(item.char).width + 2;
      letterWidths.push(w);
      totalEngWidth += w;
    }

    let startX = cx - totalEngWidth / 2;

    for (let i = 0; i < engLetters.length; i++) {
      const item = engLetters[i];
      const w = letterWidths[i];
      const lx = startX + w / 2;
      const ly = cy - 10 + item.yOffset;

      ctx.font = `900 ${item.size}px "Impact", "Arial Black", sans-serif`;
      ctx.textAlign = 'center';

      // 多重立体ドロップシャドウ
      ctx.fillStyle = '#0a0020';
      ctx.fillText(item.char, lx + 6, ly + 7);
      ctx.fillStyle = '#220044';
      ctx.fillText(item.char, lx + 4, ly + 5);
      ctx.fillStyle = '#660055';
      ctx.fillText(item.char, lx + 2, ly + 2);

      // 鮮烈なネオンギャラクシーグラデーション
      const grad = ctx.createLinearGradient(lx, ly - item.size / 2, lx, ly + item.size / 2);
      grad.addColorStop(0, '#00ffff');
      grad.addColorStop(0.3, '#ffffff');
      grad.addColorStop(0.55, '#ff77aa');
      grad.addColorStop(0.8, '#ff0055');
      grad.addColorStop(1, '#880044');

      ctx.fillStyle = grad;
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 18;
      ctx.fillText(item.char, lx, ly);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.strokeText(item.char, lx, ly);

      startX += w;
    }

    // 3. 下にカタカナで「ギャラクトリス」（だんだんサイズに差をつけたロゴらしいデザイン！）
    const jpChars = [
      { char: 'ギ', size: 38, yOff: -2 },
      { char: 'ャ', size: 30, yOff: 1 },
      { char: 'ラ', size: 34, yOff: -1 },
      { char: 'ク', size: 32, yOff: 0 },
      { char: 'ト', size: 30, yOff: 1 },
      { char: 'リ', size: 28, yOff: 2 },
      { char: 'ス', size: 32, yOff: 0 },
    ];

    let totalJpWidth = 0;
    const jpWidths: number[] = [];
    for (const item of jpChars) {
      ctx.font = `bold ${item.size}px "DotGothic16", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif`;
      const w = ctx.measureText(item.char).width + 6;
      jpWidths.push(w);
      totalJpWidth += w;
    }

    let startJpX = cx - totalJpWidth / 2;
    const jpBaseY = cy + 54;

    for (let i = 0; i < jpChars.length; i++) {
      const item = jpChars[i];
      const w = jpWidths[i];
      const jx = startJpX + w / 2;
      const jy = jpBaseY + item.yOff;

      ctx.font = `bold ${item.size}px "DotGothic16", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif`;
      ctx.textAlign = 'center';

      // 影
      ctx.fillStyle = '#001122';
      ctx.fillText(item.char, jx + 2, jy + 3);

      // ゴールドイエローの鮮明なネオン発光
      const jpGrad = ctx.createLinearGradient(jx, jy - item.size / 2, jx, jy + item.size / 2);
      jpGrad.addColorStop(0, '#ffea00');
      jpGrad.addColorStop(0.5, '#ffffff');
      jpGrad.addColorStop(1, '#ff8800');

      ctx.fillStyle = jpGrad;
      ctx.shadowColor = '#ffcc00';
      ctx.shadowBlur = 12;
      ctx.fillText(item.char, jx, jy);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.0;
      ctx.strokeText(item.char, jx, jy);

      startJpX += w;
    }

    ctx.restore();
  }

  // 画面下に往年のNAMCO風「MUKKII」作者ロゴを描画（細くクッキリ読みやすく、権利表記との重なりを完全解消）
  private drawNamcoStyleMukkiiLogo(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    const namcoRed = '#e60012';
    const logoText = 'mukkii';
    ctx.font = '900 28px "Arial Black", "Trebuchet MS", sans-serif';

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // 白いフチ（細く2.5pxにして文字の隙間を潰さない）
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeText(logoText, cx, cy);

    // 赤い文字本体
    ctx.fillStyle = namcoRed;
    ctx.shadowColor = 'rgba(230, 0, 18, 0.5)';
    ctx.shadowBlur = 6;
    ctx.fillText(logoText, cx, cy);

    // 権利表記・クレジット（mukkiiロゴの下端から充分な余白をとって整列）
    ctx.textBaseline = 'top';
    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.fillStyle = '#8b949e';
    ctx.shadowBlur = 0;
    ctx.fillText('© 2026 MUKKII ALL RIGHTS RESERVED', cx, cy + 12);

    ctx.font = '9px monospace';
    ctx.fillStyle = '#6e7681';
    ctx.fillText('SOUND: OtoLogic / 効果音ラボ', cx, cy + 27);

    ctx.font = '8px monospace';
    ctx.fillStyle = '#484f58';
    ctx.fillText('VER 3.0 (TERRAIN & RETRO SHOOTER MECHANICS)', cx, cy + 40);
    // ★ 端末に古い版がキャッシュされていないかを一目で確認できるようにビルド日時を添える
    //   （itch.io は更新しても index.html の URL が変わらないため）
    if (typeof __BUILD_ID__ === 'string') {
      ctx.fillText(`BUILD ${__BUILD_ID__}`, cx, cy + 54);
    }

    ctx.restore();
  }
}
