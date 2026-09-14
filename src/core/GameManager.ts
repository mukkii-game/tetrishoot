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
  { rank: 'UFO_MOTHERSHIP', hp: 96, pattern: 'CAROUSEL_CIRCLE' },
];
export type GamePhase = 'TETRIS' | 'SHOOTING';

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
  public difficulty: 'NORMAL' | 'HARD' = 'NORMAL';

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

  // ボス出現・撃破管理
  public bossSpawned = false;
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
  public titleMenuSelection: 'DIFFICULTY' | 'STAGE' = 'DIFFICULTY';
  public selectedStage: number = 1; // タイトル画面＆ポーズ画面で選べるステージ (1〜10)
  private rescueSpawnCooldown = 0;
  // ★ ユーザー要望：救済テトリミノは1つ目が3秒後、2つ目以降は5秒後
  private static readonly RESCUE_FIRST_DELAY = 3.0;
  private static readonly RESCUE_NEXT_DELAY = 5.0;
  public dockingTimer = 30.0; // ユーザー要望：ドッキングせよ 30.0から減っていく

  private deathDelay = 0; // 自機爆発アニメーション用ディレイ
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
    const saved = localStorage.getItem('galaxtris_hiscore');
    if (saved) this.highScore = parseInt(saved, 10) || 0;
  }

  public startNewGame(startStage?: number): void {
    this.stage = startStage !== undefined ? startStage : this.selectedStage;
    this.score = 0;
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
    this.shootingTimeLimit = 65; // バトル時間をさらに延長（ザコ2倍＋高耐久ボス戦に充分な時間）
    this.bossRushIndex = 0;
    this.formationOffsetAngle = 0;
    this.battlePiece = null;
    this.rescueSpawnCooldown = GameManager.RESCUE_FIRST_DELAY;
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
    this.terrain.siloStartDelay = this.stage === 5 ? 10.0 : 2.5;

    // 洞窟内・ステージ開始時にフィールドアイテムを配置
    this.fieldItems = [];
    if (isSalamander && direction === 'LEFT') {
      // 左スクロール面：アイテムは画面左の外から右へ流れ込んでくる
      this.fieldItems.push(new FieldItem(-120, CANVAS_HEIGHT * 0.5, 'BARRIER_ORB'));
      this.fieldItems.push(new FieldItem(-500, CANVAS_HEIGHT * 0.4, 'RESCUE_CAPSULE'));
    } else if (isSalamander) {
      // 洞窟内にバリアオーブや救済カプセルを配置
      this.fieldItems.push(new FieldItem(CANVAS_WIDTH * 0.5, -120, 'BARRIER_ORB'));
      this.fieldItems.push(new FieldItem(CANVAS_WIDTH * 0.35, -500, 'RESCUE_CAPSULE'));
    } else if (this.stage >= 4) {
      this.fieldItems.push(new FieldItem(CANVAS_WIDTH * 0.5, -80, 'BARRIER_ORB'));
    }

    // ギャラガ＆ムーンクレスタ風 多彩な大編隊をスポーン！
    this.spawnAlienFleet();

    this.sound.playPhaseAlert('shooting');
    this.sound.startBGM('shooting');
    this.showTransitionText(`STAGE ${this.stage}`, 1.8);
  }

  private showTransitionText(text: string, scale = 1.0): void {
    this.transitionText = text;
    this.transitionScale = scale;
    this.transitionAlpha = 1.0;
  }

  public update(dt: number, input: Input): void {
    if (input.mutePressed) {
      this.sound.toggleMute();
    }

    // 画面右上の MUTE / PAUSE ボタンのクリック・タップ判定
    if (input.justMouseDown && input.mouseX !== null && input.mouseY !== null && input.mouseY >= 6 && input.mouseY <= 46) {
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
      this.starfield.update(dt, this.phase === 'SHOOTING' ? 2.4 : 1.2);
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

        // ★ 上下キーで「難易度」⇔「ステージ」の行を行き来
        if (input.justRotate || input.justDrop) {
          this.titleMenuSelection = this.titleMenuSelection === 'DIFFICULTY' ? 'STAGE' : 'DIFFICULTY';
          this.sound.playHit();
        }

        // 左右キー：選択中の行の値を変更（難易度 or ステージ）
        if (input.justLeft || input.justRight) {
          if (this.titleMenuSelection === 'DIFFICULTY') {
            this.difficulty = this.difficulty === 'NORMAL' ? 'HARD' : 'NORMAL';
          } else if (input.justLeft) {
            this.selectedStage = this.selectedStage > 1 ? this.selectedStage - 1 : 10;
          } else {
            this.selectedStage = this.selectedStage < 10 ? this.selectedStage + 1 : 1;
          }
          this.sound.playHit();
        }

        // 難易度切り替えタップ判定 (Y: 420..468)
        if (input.justMouseDown && input.mouseY !== null && input.mouseY >= 420 && input.mouseY <= 468) {
          this.titleMenuSelection = 'DIFFICULTY';
          if (input.mouseX !== null) {
            this.difficulty = input.mouseX < CANVAS_WIDTH / 2 ? 'NORMAL' : 'HARD';
          } else {
            this.difficulty = this.difficulty === 'NORMAL' ? 'HARD' : 'NORMAL';
          }
          this.sound.playHit();
          break;
        }

        // 面セレクト切り替えタップ判定 (Y: 475..528)
        if (input.justMouseDown && input.mouseY !== null && input.mouseY >= 475 && input.mouseY <= 528) {
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

        // ゲーム開始（単発Space、Enter、またはゲーム開始エリアのタップ）
        if (input.justShoot || input.justEnter || (input.justMouseDown && (input.mouseY === null || input.mouseY < 420 || input.mouseY > 530))) {
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

          // マウスクリックでの選択＆決定
          if (input.isMouseDown && input.mouseY !== null) {
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
        if (this.stateTimer <= 0 && (input.shoot || input.justEnter || input.isMouseDown)) {
          this.sound.stopClearMusic();
          this.startNewGame();
        }
        break;
    }

    input.resetPerFrame();
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

      this.player.updateMovement(dt, input);
      this.updateShootingPhase(dt, input);
    }

    if (this.player.isDead) {
      if (!this.playerDeathSoundPlayed) {
        this.playerDeathSoundPlayed = true;
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
      if (Math.random() < 0.35) {
        const px = this.player.anchorX + BLOCK_SIZE + (Math.random() - 0.5) * 40;
        const py = this.player.anchorY + BLOCK_SIZE + (Math.random() - 0.5) * 40;
        this.particles.emitExplosion(px, py, Math.random() > 0.5 ? '#ff2200' : '#ffea00', 16, true);
        this.sound.playExplosion(false);
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
      vy: 42, // ゆっくり降下
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

    // 1. 自機の操作（エクセリオン風慣性移動）
    this.player.updateMovement(dt, input);

    // 発射ロックアウト減算（ゲーム開始直後の誤射防止）
    if (this.fireLockout > 0) this.fireLockout -= dt;

    // 2. 自機ショット発射（弾を撃って落下中ミノに当てる！）
    if ((input.shoot || input.isMouseDown) && this.player.fireCooldown <= 0 && this.fireLockout <= 0) {
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

      // ★ ユーザー要望：弾を当てるたびに落下速度・左右速度が少しずつ上がる（1発ごとに+6%、最大2倍）
      const speedMul = Math.min(2.0, 1 + (item.hitCount || 0) * 0.06);

      // 重力加速度＆慣性落下ダイナミクス
      const GRAVITY = 110 * speedMul;
      const MAX_FALL_SPEED = 60 * speedMul;

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
      const pieceBounds = item.piece.getBoundingBox(item.x, item.y);
      const pieceCenterX = (pieceBounds.minX + pieceBounds.maxX) / 2;

      for (let bi = this.playerBullets.length - 1; bi >= 0; bi--) {
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
          const hitMul = Math.min(2.0, 1 + item.hitCount * 0.06);

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
        for (let i = 0; i < 4; i++) {
          this.enemies.push(new Enemy('SPLITTING_EYE', 'MOON_COLD_EYE', i, 0, START_DELAY));
        }
        // フェーズ2（t=10.5〜）：増援コールドアイ4機（上空から滑空して編隊形成）
        for (let i = 0; i < 4; i++) {
          this.enemies.push(new Enemy('SPLITTING_EYE', 'MOON_COLD_EYE', i, 0, START_DELAY + 9.0));
        }
        // フェーズ3（t=18.5〜）：スーパーアイ8機（左右壁面バウンドの電光石火ダイブ）
        for (let i = 0; i < 8; i++) {
          this.enemies.push(new Enemy('MINI_EYE', 'MOON_SUPER_EYE', i, 0, START_DELAY + 17.0 + i * 0.4));
        }
        break;

      case 2:
        // 【STAGE 2：純粋なギャラガ大旋回面（グルングルン回る高速編隊＆画面全体スウィング）】
        // ユーザー要望：2面ってギャラガモチーフじゃなかったっけ？ もっとグルングルン回るよね編隊、画面全体使って、それなりの速度で。したまでくる！
        // ウェーブ1（t=1.5〜）：左から大S字ループで下部(y≈620)まで急降下旋回するグリーン・ドローン隊（8機）
        for (let k = 0; k < (this.difficulty === 'HARD' ? 12 : 8); k++) {
          this.enemies.push(new Enemy('GREEN_DRONE', 'STREAM_CURVE', 1 + (k % 4), 2, START_DELAY, 'S_CURVE_LEFT_TO_RIGHT', k));
        }
        // ウェーブ2（t=6.5〜）：右から大S字ループで逆から画面全体を横断・下部スウィングするレッド・ガード隊（8機）
        for (let k = 0; k < (this.difficulty === 'HARD' ? 12 : 8); k++) {
          this.enemies.push(new Enemy('RED_GUARD', 'STREAM_CURVE', 4 + (k % 4), 1, START_DELAY + 5.0, 'S_CURVE_RIGHT_TO_LEFT', k));
        }
        // ウェーブ3（t=12.0〜）：左右から同時に突入し中央で8の字インフィニティループを描く交差編隊！
        for (let k = 0; k < (this.difficulty === 'HARD' ? 14 : 8); k++) {
          this.enemies.push(new Enemy('GREEN_DRONE', 'STREAM_CURVE', 2 + (k % 4), 3, START_DELAY + 10.5, 'INFINITY_DIVE_LEFT', k));
          this.enemies.push(new Enemy('RED_GUARD', 'STREAM_CURVE', 3 + (k % 4), 3, START_DELAY + 10.5, 'INFINITY_DIVE_RIGHT', k));
        }
        // ウェーブ4（t=18.5〜）：巨大8の字大旋回ループで画面を舞うイエロー司令機＆護衛隊！
        for (let k = 0; k < 6; k++) {
          this.enemies.push(new Enemy('YELLOW_COMMANDER', 'STREAM_CURVE', 3 + (k % 3), 0, START_DELAY + 17.0, 'FIGURE_EIGHT', k));
        }
        break;

      case 3:
        // 【STAGE 3：スターフォース名物「ガリ」＆ 90度直角旋回機 ＆ 左右ワープランナー】
        // ユーザー要望：敵を混ぜずに順番に出す
        // フェーズ1（t=1.5〜）：スターフォース「ガリ」第一波（深く急降下→急停止スウィング→超高速ダッシュ）
        for (let i = 0; i < (this.difficulty === 'HARD' ? 16 : 10); i++) {
          this.enemies.push(new Enemy('STARFORCE_GARI', 'STARFORCE_GARI_MOVE', 1 + (i % 6), 0, START_DELAY + i * 0.4));
        }
        // ★ ユーザー要望：3面は地形もあり難しいので、敵種が混ざらないよう各フェーズの間隔を大きく広げて一種類ずつ出す
        // フェーズ2（t=13.5〜）：左右ループ走査機（画面端から反対端へループワープする巡航機）
        for (let i = 0; i < (this.difficulty === 'HARD' ? 14 : 8); i++) {
          this.enemies.push(new Enemy('SIDE_WARP_RUNNER', 'SIDE_WRAP_SWEEP', i % 2 === 0 ? 0 : 7, i % 3, START_DELAY + 12.0 + i * 0.35));
        }
        // フェーズ3（t=24.0〜）：左右端落下→自機Yで90度直角旋回突進！
        for (let i = 0; i < (this.difficulty === 'HARD' ? 14 : 8); i++) {
          this.enemies.push(new Enemy('STARFORCE_CORNER', 'STARFORCE_CORNER_DIVE', i, 0, START_DELAY + 22.5 + i * 0.38));
        }
        break;

      case 4:
        // 【STAGE 4：索敵急加速ミサイル ＆ フォー・フライ ＆ 広域ギャラガ大旋回】
        // 地形スクロールのない宇宙空間で、ギャラガ編隊が縦横無尽に画面全体を舞う！
        // フェーズ1（t=1.5〜）：索敵急加速ミサイル（フワリと横移動後、突如バーニア点火で急加速）
        for (let i = 0; i < (this.difficulty === 'HARD' ? 16 : 10); i++) {
          this.enemies.push(new Enemy('DART_MISSILE', 'DELAYED_DART', 1 + (i % 6), 0, START_DELAY + i * 0.35));
        }
        // フェーズ2（t=7.5〜）：オープン空間を縦横無尽に飛び回るギャラガ交差ストリーム編隊！
        for (let k = 0; k < 12; k++) {
          this.enemies.push(new Enemy('GREEN_DRONE', 'STREAM_CURVE', 2 + (k % 4), 2, START_DELAY + 6.0, 'INFINITY_DIVE_LEFT', k));
          this.enemies.push(new Enemy('RED_GUARD', 'STREAM_CURVE', 3 + (k % 4), 2, START_DELAY + 6.0, 'INFINITY_DIVE_RIGHT', k));
        }
        // フェーズ3（t=14.0〜）：ムーンクレスタ名物「フォー・フライ」（カミソリ急降下ジグザグ）
        for (let i = 0; i < (this.difficulty === 'HARD' ? 16 : 10); i++) {
          this.enemies.push(new Enemy('FOUR_FLY', 'ZIGZAG_DIVE', 1 + (i % 8), 0, START_DELAY + 12.5 + i * 0.3));
        }
        break;

      case 5:
        // 【STAGE 5：ドラマチック起承転結ステージ（静寂 → スリル → クライマックス大群 → UFO母船ボス）】
        // ユーザー要望：5面とかただやみくもに複数の敵をたくさん出してるだけじゃない？ まず面の最初からたくさん出すなよ
        // 1面の中でも静かに始まって、ところどころスリルのあるところがあって、ものすごくてきがたくさん！みたいなクライマックスがあって、その後ボス！
        //
        // ★ ユーザー要望：Stage 5 は地形に非常にぶつかりやすく難しいので、出現敵を約半分に削減
        // ★ ユーザー要望：5面は開始10秒間は敵を一匹も出さない（地形に慣れる時間）
        // 1. 【静かな導入】（t=10.0〜）：斥候ドローン1機が優雅に横断
        this.enemies.push(new Enemy('GREEN_DRONE', 'STREAM_CURVE', 3, 1, 10.0, 'S_CURVE_LEFT_TO_RIGHT', 0));
        // 2. 【スリル・急襲】（t=13.0〜）：索敵急加速ミサイル1発、続いて（t=15.0〜）地表ミサイル2発
        this.enemies.push(new Enemy('DART_MISSILE', 'DELAYED_DART', 1, 0, 13.0));
        for (let i = 0; i < 2; i++) {
          this.enemies.push(new Enemy('TERRAIN_MISSILE', 'TERRAIN_LAUNCH', i, 0, 15.0 + i * 1.0));
        }
        // ★ ユーザー要望：壁自体が難しいので、中盤以降も敵を少なめにし、種類の混合も減らして一種類ずつ順番に出す
        // 3. 【加速する緊張】（t=19.0〜）：ガリの急停止＆急加速アタック（2機、間隔広め）
        for (let i = 0; i < (this.difficulty === 'HARD' ? 3 : 2); i++) {
          this.enemies.push(new Enemy('STARFORCE_GARI', 'STARFORCE_GARI_MOVE', 1 + (i % 5), 0, 19.0 + i * 1.2));
        }
        // 4. 【クライマックス】（t=24.0〜）：片側からの旋回編隊のみ（左右同時のクロスラッシュは廃止）
        for (let k = 0; k < (this.difficulty === 'HARD' ? 5 : 3); k++) {
          this.enemies.push(new Enemy('RED_GUARD', 'STREAM_CURVE', 1 + (k % 4), 2, 24.0, 'INFINITY_DIVE_LEFT', k));
        }
        // 5. （t=29.0〜）：グラディウス編隊は前の編隊が抜けてから、少数で
        for (let i = 0; i < (this.difficulty === 'HARD' ? 3 : 2); i++) {
          this.enemies.push(new Enemy('GRADIUS_FAN', 'GRADIUS_FLEET', 1 + (i % 5), 0, 29.0 + i * 0.8));
        }
        break;

      case 6:
        // 【WAVE 6：沙羅曼蛇 2・横スクロール 右方向バンガード岩盤回廊】（ザコ52機）
        // 天井と床から突き出るバンガードブロック岩！ガリの急襲＋索敵加速ミサイル＋トーロイド！
        for (let i = 0; i < 14; i++) {
          this.enemies.push(new Enemy('STARFORCE_GARI', 'STARFORCE_GARI_MOVE', 1 + (i % 6), 0, 0.2 + i * 0.25));
        }
        for (let i = 0; i < 12; i++) {
          this.enemies.push(new Enemy('DART_MISSILE', 'DELAYED_DART', 1 + (i % 5), 0, 0.8 + i * 0.22));
        }
        for (let i = 0; i < 14; i++) {
          this.enemies.push(new Enemy('TOROID_SCOUT', 'XEVIOUS_TOROID', 1 + (i % 6), 1, 1.4 + i * 0.2));
        }
        for (let i = 0; i < 10; i++) {
          this.enemies.push(new Enemy('TERRAIN_MISSILE', 'TERRAIN_LAUNCH', 1 + (i % 5), 0, 2.0 + i * 0.18));
        }
        break;

      case 7:
        // 【WAVE 7：ムーンクレスタ Stage 5&7・アトミック・ファントム＆ベータ・ファントム】（ザコ58機）
        // 鋭角急加速突撃のアトミック・ファントム＋コウモリ翼ベータ・ファントム＋斜めメテオ乱舞！
        for (let i = 0; i < 18; i++) {
          this.enemies.push(new Enemy('ATOMIC_PHANTOM', 'ZIGZAG_DIVE', 1 + (i % 8), 1, 0.2 + i * 0.14));
        }
        for (let i = 0; i < 16; i++) {
          this.enemies.push(new Enemy('BETA_PHANTOM', 'MOON_SPLIT_FLOAT', 1 + (i % 7), 0, 0.6 + i * 0.16));
        }
        for (let i = 0; i < 16; i++) {
          this.enemies.push(new Enemy('METEOR_ROCK', 'METEOR_DIAGONAL', 1 + (i % 8), 0, 1.0 + i * 0.14));
        }
        for (let i = 0; i < 12; i++) {
          this.enemies.push(new Enemy('STARFORCE_GARI', 'STARFORCE_GARI_MOVE', 1 + (i % 6), 0, 2.2 + i * 0.2));
        }
        break;

      case 8:
        // 【WAVE 8：左スクロール・バンガード岩盤回廊 ＋ ギャラガ・総力大編隊（インフィニティ大乱舞＆四方包囲）】（ザコ66機）
        // ★ ユーザー要望：Stage 8 は地形のある左スクロール面（Stage 6 の反対方向）
        // 画面全方位から押し寄せるギャプラス風ストリーム大編隊＋グラディウス開幕編隊＋フライバイ！
        for (let k = 0; k < 20; k++) {
          this.enemies.push(new Enemy('GREEN_DRONE', 'STREAM_CURVE', 1 + (k % 5), 3, 0.12, 'INFINITY_DIVE_LEFT', k));
          this.enemies.push(new Enemy('RED_GUARD', 'STREAM_CURVE', 4 + (k % 5), 3, 0.12, 'INFINITY_DIVE_RIGHT', k));
        }
        for (let i = 0; i < 14; i++) {
          this.enemies.push(new Enemy('GRADIUS_FAN', 'GRADIUS_FLEET', 1 + (i % 6), 0, 0.8 + i * 0.18));
        }
        for (let i = 0; i < 14; i++) {
          this.enemies.push(new Enemy('DART_MISSILE', 'DELAYED_DART', 1 + (i % 6), 0, 1.4 + i * 0.16));
        }
        for (let i = 0; i < 10; i++) {
          this.enemies.push(new Enemy('FAST_FLYBY', 'FLYBY_CROSS', 1 + (i % 5), 0, 2.2 + i * 0.15));
        }
        break;

      case 9:
        // 【WAVE 9：沙羅曼蛇 3・極限バンガード迷宮要塞】（ザコ72機）
        // 左右から大きくせり出す山鳴りブロック回廊＋ガリ・索敵ミサイル・トーロイドの猛攻！
        for (let i = 0; i < 18; i++) {
          this.enemies.push(new Enemy('STARFORCE_GARI', 'STARFORCE_GARI_MOVE', 1 + (i % 6), 0, 0.2 + i * 0.18));
        }
        for (let i = 0; i < 18; i++) {
          this.enemies.push(new Enemy('DART_MISSILE', 'DELAYED_DART', 1 + (i % 6), 0, 0.6 + i * 0.16));
        }
        for (let i = 0; i < 16; i++) {
          this.enemies.push(new Enemy('TOROID_SCOUT', 'XEVIOUS_TOROID', 1 + (i % 7), 1, 1.0 + i * 0.15));
        }
        for (let i = 0; i < 14; i++) {
          this.enemies.push(new Enemy('TERRAIN_MISSILE', 'TERRAIN_LAUNCH', 1 + (i % 6), 0, 1.5 + i * 0.15));
        }
        break;

      case 10:
      default:
        // 【WAVE 10：最終決戦・オールスター総力戦カタストロフィ】（ザコ90機超え！）
        // ムーンクレスタ怪獣・スターフォース・グラディウス・沙羅曼蛇が総結集する究極のラストバトル！
        for (let i = 0; i < 16; i++) {
          this.enemies.push(new Enemy('STARFORCE_GARI', 'STARFORCE_GARI_MOVE', 1 + (i % 6), 0, 0.1 + i * 0.14));
        }
        for (let i = 0; i < 14; i++) {
          this.enemies.push(new Enemy('GRADIUS_FAN', 'GRADIUS_FLEET', 1 + (i % 6), 0, 0.4 + i * 0.16));
        }
        for (let i = 0; i < 16; i++) {
          this.enemies.push(new Enemy('DART_MISSILE', 'DELAYED_DART', 1 + (i % 6), 0, 0.7 + i * 0.14));
        }
        for (let i = 0; i < 18; i++) {
          this.enemies.push(new Enemy('BETA_PHANTOM', 'MOON_SPLIT_FLOAT', 1 + (i % 7), 0, 1.0 + i * 0.12));
        }
        for (let i = 0; i < 16; i++) {
          this.enemies.push(new Enemy('METEOR_ROCK', 'METEOR_DIAGONAL', 1 + (i % 8), 0, 1.4 + i * 0.1));
        }
        break;
    }

    // ★ ユーザー要望：面の最初、ドッキング直後に即死しないよう全ステージ共通で開幕セーフティ時間を保証
    // （Stage 6〜10 は個別ディレイが 0.1〜2.2 秒と短かったため、一律 START_DELAY 分だけ後ろ倒し）
    if (this.stage >= 6) {
      for (const e of this.enemies) {
        e.delaySpawn(START_DELAY);
      }
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

    // ★ ユーザー要望：ハードモードはボスを2倍固くする！
    if (this.difficulty === 'HARD') {
      bossHp *= 2;
    }

    // ★ ユーザー要望：3面ってボスは下から来てもいいよね（SURPRISE_FROM_BOTTOMで画面下部から急上昇！）
    const pattern = this.stage === 10
      ? BOSS_RUSH[Math.min(this.bossRushIndex, BOSS_RUSH.length - 1)].pattern
      : (this.stage === 6 ? 'SERPENT_SLITHER' : (this.stage === 3 ? 'SURPRISE_FROM_BOTTOM' : 'FORMATION_LOOP'));
    const boss = new Enemy(bossRank, pattern, 4, 0, 0.1, undefined, 0, true, bossHp);
    boss.scoreValue = 3000 + this.stage * 1000 + (this.stage === 10 ? this.bossRushIndex * 2000 : 0);
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

    // 護衛を2機随伴（高ステージ）
    if (this.stage >= 4 && bossRank !== 'SPACE_SERPENT_HEAD') {
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
    if ((input.shoot || input.isMouseDown) && this.player.fireCooldown <= 0) {
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

    // シューティング中の救済落下テトリミノ更新＆ドッキング判定
    if (this.battlePiece && !this.battlePiece.settled) {
      this.battlePiece.fallTimer += dt;
      if (this.battlePiece.dockCooldown && this.battlePiece.dockCooldown > 0) {
        this.battlePiece.dockCooldown -= dt;
      }

      const GRAVITY = 110;
      const MAX_FALL_SPEED = 60;
      this.battlePiece.vy += GRAVITY * dt;
      if (this.battlePiece.vy > MAX_FALL_SPEED) {
        this.battlePiece.vy = MAX_FALL_SPEED;
      }

      this.battlePiece.vx *= (1 - 0.5 * dt);
      this.battlePiece.vx += Math.sin(this.battlePiece.fallTimer * 1.5) * 15 * dt;

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
      const pieceBounds = this.battlePiece.piece.getBoundingBox(this.battlePiece.x, this.battlePiece.y);
      const pieceCenterX = (pieceBounds.minX + pieceBounds.maxX) / 2;

      for (let bi = this.playerBullets.length - 1; bi >= 0; bi--) {
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
    this.terrain.update(dt, this.phase === 'SHOOTING' ? 140 : 60, (lx, ly, vx, vy) => {
      // 洞窟壁から横・斜めへミサイル噴射発射！
      const m = new Enemy('TERRAIN_MISSILE', 'TERRAIN_LAUNCH', 0, 0, 0);
      m.x = lx;
      m.y = ly;
      m.vx = vx;
      m.vy = vy;
      // ★ 壁際で約1.3秒、上下に揺れる予備動作を見せてから突っ込む
      m.prelaunchTimer = 1.3;
      m.prelaunchBaseY = ly;
      this.enemies.push(m);
      this.particles.emitSparks(lx, ly, '#ff4400', 8);
    });

    // 要望②：自機 vs 地形の衝突判定（狭窄洞窟でパーツ破損・Oミノ破壊でゲームオーバー）
    if (this.terrainHitCooldown > 0) {
      this.terrainHitCooldown -= dt;
    }

    if (this.terrain.enabled && !this.player.isDead && this.terrainHitCooldown <= 0) {
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
              this.player.barrierTimer = Math.max(this.player.barrierTimer, WALL_GRACE);
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

    // ★ フィールドアイテムの更新＆プレイヤー取得判定
    const scrollSpeed = 140;
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
          this.player.barrierTimer = 5.0;
          this.showTransitionText('BARRIER (5 SEC)!', 1.2);
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
      if (!this.bossWarningActive && (this.shootingTimeLimit <= 32 || this.enemies.length <= 6)) {
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
    if (this.currentBoss && !this.currentBoss.isDead && !this.bossDying) {
      this.bossMinionTimer += dt;
      const spawnInterval = this.difficulty === 'HARD' ? 2.8 : 4.0;
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
              this.currentBoss = null;
              this.bossDying = true;
              this.bossDeathTimer = 0;
              this.hitStopTimer = 0.08;
              this.screenShake = 14;

              // ★ ユーザー要望：ボスを倒したら残っているザコはつられて連鎖爆破する！
              let chainDelay = 0;
              for (const z of this.enemies) {
                if (!z.isDead && z !== enemy) {
                  z.isDead = true;
                  chainDelay += 0.04;
                  window.setTimeout(() => {
                    this.sound.playEnemyPop(z.rank);
                    this.particles.emitExplosion(
                      z.x + z.width / 2,
                      z.y + z.height / 2,
                      '#ffaa00',
                      18,
                      false
                    );
                  }, chainDelay * 1000);
                  this.score += z.scoreValue;
                }
              }
              return;
            } else {
              if (isGiant) {
                this.sound.playExplosion(true);
              } else {
                this.sound.playEnemyPop(enemy.rank);
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
          } else {
            this.hitStopTimer = 0.025;
            this.screenShake = Math.max(this.screenShake, 3);
          }
          break;
        }
      }
    }

    // 敵本体 vs 自機 体当たり判定（ムーンクレスタ仕様！）
    for (const enemy of this.enemies) {
      if (enemy.isDead) continue;
      const hitRes = this.player.checkHit(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, this.particles);
      if (hitRes.hit) {
        // 切り離されたパーツが発生した場合は浮遊物としてスポーン
        if (hitRes.detachedPieces && hitRes.detachedPieces.length > 0) {
          this.spawnDetachedFloatingPieces(hitRes.detachedPieces);
        }

        const killed = enemy.hit(5);
        this.sound.playExplosion(true);
        this.screenShake = 12;
        this.hitStopTimer = 0.05;
        if (killed && (enemy === this.currentBoss || enemy.isBoss)) {
          this.sound.playBossExplosion();
          this.particles.emitBossExplosion(
            enemy.x + enemy.width / 2,
            enemy.y + enemy.height / 2,
            enemy.width,
            enemy.height
          );
          this.score += enemy.scoreValue;
          this.currentBoss = null;
          this.bossDying = true;
          this.bossDeathTimer = 0;
          this.hitStopTimer = 0.08;
          this.screenShake = 16;
          return;
        }
      }
    }

    // タイムオーバーまたは敵全滅クリア判定（落下ブロックがある場合は落ちきるまで待つ）
    if (
      !this.bossDying &&
      (!this.battlePiece || this.battlePiece.settled) &&
      ((this.bossSpawned && !this.currentBoss && this.enemies.length === 0) || this.shootingTimeLimit <= 0)
    ) {
      this.onBossPhaseEnded();
    }
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
      this.titleMenuSelection = 'DIFFICULTY';
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
      this.titleMenuSelection = 'DIFFICULTY';
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

  // ★ ユーザー要望：Oミノだけになった時の救済テトリミノ投下
  private spawnRescuePiece(): void {
    const candidateTypes: TetrominoType[] = ['T', 'L', 'J', 'I', 'S', 'Z'];
    const pType = candidateTypes[Math.floor(Math.random() * candidateTypes.length)];
    const piece = new TetrominoPiece(pType);
    const rots = Math.floor(Math.random() * 4);
    for (let r = 0; r < rots; r++) piece.rotate();

    // 自機の横位置付近に投下
    const spawnX = Math.max(60, Math.min(CANVAS_WIDTH - 140, this.player.anchorX + (Math.random() - 0.5) * 80));

    this.battlePiece = {
      index: 0,
      piece,
      x: spawnX,
      y: -45,
      vx: (Math.random() > 0.5 ? 1 : -1) * 35,
      vy: 55,
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
      const shakeX = (Math.random() - 0.5) * this.screenShake;
      const shakeY = (Math.random() - 0.5) * this.screenShake;
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
  }

  /** ハイスコア保存（更新があればlocalStorageへ永続化） */
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
    ctx.fillStyle = 'rgba(20, 30, 48, 0.7)';
    ctx.strokeStyle = '#304560';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(486, 10, 36, 32, 6);
    else ctx.rect(486, 10, 36, 32);
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 16px "Segoe UI Emoji", "Apple Color Emoji", monospace';
    ctx.fillStyle = '#00f0ff';
    ctx.fillText('⏸', 504, 26);
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

      // 2. 難易度セレクター（NORMAL / HARD）
      const isNormal = this.difficulty === 'NORMAL';
      const isHard = this.difficulty === 'HARD';
      const selDiff = this.titleMenuSelection === 'DIFFICULTY';

      // ★ 選択中の行（難易度 or ステージ）にだけ四角枠を表示
      const drawSelectFrame = (y: number, h: number) => {
        ctx.fillStyle = 'rgba(0, 40, 80, 0.45)';
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 1.2;
        ctx.shadowBlur = 0;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(CANVAS_WIDTH / 2 - 190, y, 380, h, 8);
        else ctx.rect(CANVAS_WIDTH / 2 - 190, y, 380, h);
        ctx.fill();
        ctx.stroke();
      };
      if (selDiff) drawSelectFrame(414, 48);

      // ★ ユーザー要望：NORMAL / HARD はSTAGE選択と同じ大きさの文字に
      ctx.font = '900 19px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // NORMAL
      if (isNormal) {
        ctx.fillStyle = '#00f0ff';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 12;
        ctx.fillText('▶ [ NORMAL ] ◀', CANVAS_WIDTH / 2 - 100, 438);
      } else {
        ctx.fillStyle = '#667788';
        ctx.shadowBlur = 0;
        ctx.fillText('  [ NORMAL ]  ', CANVAS_WIDTH / 2 - 100, 438);
      }

      // HARD
      if (isHard) {
        ctx.fillStyle = '#ff2255';
        ctx.shadowColor = '#ff2255';
        ctx.shadowBlur = 14;
        ctx.fillText('▶ [ HARD ] ◀', CANVAS_WIDTH / 2 + 100, 438);
      } else {
        ctx.fillStyle = '#667788';
        ctx.shadowBlur = 0;
        ctx.fillText('  [ HARD ]  ', CANVAS_WIDTH / 2 + 100, 438);
      }

      ctx.shadowBlur = 0;
      ctx.textBaseline = 'alphabetic';

      // 3. 面セレクト（STAGE SELECT: ◀ STAGE [ X ] ▶）
      if (!selDiff) drawSelectFrame(478, 48);

      ctx.font = '900 19px monospace';
      ctx.fillStyle = selDiff ? '#5599aa' : '#00ffff';
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = selDiff ? 0 : 10;
      ctx.textBaseline = 'middle';
      ctx.fillText(selDiff ? `   STAGE  [ ${this.selectedStage} ]   ` : `◀  STAGE  [ ${this.selectedStage} ]  ▶`, CANVAS_WIDTH / 2, 478 + 24); // 枠(478〜526)の上下中央
      ctx.textBaseline = 'alphabetic';
      ctx.shadowBlur = 0;

      // 4. スタートプロンプト
      const blink = Math.sin(Date.now() / 250) > 0;
      if (blink) {
        ctx.font = 'bold 17px "Courier New", monospace';
        ctx.fillStyle = '#ffea00';
        ctx.shadowColor = '#ffea00';
        ctx.shadowBlur = 10;
        ctx.fillText('TAP OR PRESS SPACE TO START', CANVAS_WIDTH / 2, 554);
      }

      // 5. 画面最下部に往年のNAMCO風「MUKKII」作者ロゴ！
      this.drawNamcoStyleMukkiiLogo(ctx, CANVAS_WIDTH / 2, 608);

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

      ctx.font = 'bold 20px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 0;
      ctx.fillText(`SCORE: ${this.score}`, CANVAS_WIDTH / 2, 320);
      ctx.fillText(`STAGE: ${this.stage} / ${MAX_STAGES}`, CANVAS_WIDTH / 2, 360);

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
      ctx.fillText(`CONGRATULATIONS!`, CANVAS_WIDTH / 2, 340);
      ctx.fillText(`TOTAL SCORE: ${this.score}`, CANVAS_WIDTH / 2, 390);

      if (this.stateTimer <= 0) {
        ctx.font = '16px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('PRESS SPACE TO PLAY AGAIN', CANVAS_WIDTH / 2, 480);
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

    ctx.restore();
  }
}
