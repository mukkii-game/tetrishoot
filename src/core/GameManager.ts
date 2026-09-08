import {
  BLOCK_SIZE,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MAX_STAGES,
  PLAYER_FIRE_INTERVAL,
} from '../config';
import { ParticleManager } from '../effects/Particle';
import { PlayerBullet } from '../entities/Bullet';
import { Enemy } from '../entities/Enemy';
import { Player } from '../entities/Player';
import { TetrominoPiece, TetrominoType } from '../entities/Tetromino';
import { drawMoonCrestaText } from '../utils/RetroFont';
import { Input } from './Input';
import { Sound } from './Sound';
import { Starfield } from './Starfield';
import { TerrainManager } from './Terrain';

export type GameState = 'TITLE' | 'PLAYING' | 'STAGE_CLEAR' | 'GAMEOVER' | 'VICTORY';
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

  public player: Player;
  public starfield: Starfield;
  public particles: ParticleManager;
  public sound: Sound;
  public terrain: TerrainManager;

  // 切断されて落下中のパーツ（再回収可能）
  public detachedPieces: DetachedFloatingPiece[] = [];

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

  // 80年代アーケード風ゲームフィール：画面揺れ（シェイク）＆ヒットストップ
  public screenShake = 0;
  public hitStopTimer = 0;
  public terrainHitCooldown = 0;

  // バトル中に時々落ちてくる回転不可ブロック（要望⑤により一時休止）
  public battlePiece: FallingPieceItem | null = null;

  private deathDelay = 0; // 自機爆発アニメーション用ディレイ
  private stateTimer = 0;
  private transitionAlpha = 0;
  private transitionText = '';
  private transitionScale = 1.0;

  constructor(sound: Sound) {
    this.sound = sound;
    this.player = new Player();
    this.starfield = new Starfield();
    this.particles = new ParticleManager();
    this.terrain = new TerrainManager();
  }

  public startNewGame(): void {
    this.stage = 1;
    this.score = 0;
    this.deathDelay = 0;
    this.player = new Player();
    this.particles.clear();
    this.detachedPieces = [];
    this.state = 'PLAYING';
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

    this.sound.playStartJingle();
    this.sound.startBGM('tetris');
    this.showTransitionText('ドッキングせよ', 1.0);
  }

  private startShootingPhase(): void {
    this.phase = 'SHOOTING';
    this.fallingPieces = [];
    this.shootingTimeLimit = 65; // バトル時間をさらに延長（ザコ2倍＋高耐久ボス戦に充分な時間）
    this.formationOffsetAngle = 0;
    this.battlePiece = null; // 要望⑤：シューティング時のミノ落下は一旦休止
    this.bossSpawned = false;
    this.currentBoss = null;
    this.bossDying = false;
    this.bossDeathTimer = 0;

    // 要望②：Wave 3, 6等は「右スクロール面」！それ以外は「上スクロール面」
    const isRightScroll = this.stage === 3 || this.stage === 6;
    const direction = isRightScroll ? 'RIGHT' : 'UP';
    this.starfield.direction = direction;

    // 地形有効化（グラディウス・サラマンダー風の狭窄洞窟）
    // Wave 2以降、あるいは全ウェーブで地形を適用
    const enableTerrain = this.stage >= 2;
    this.terrain.reset(direction, enableTerrain);

    // ギャラガ＆ムーンクレスタ風 多彩な大編隊をスポーン！
    this.spawnAlienFleet();

    this.sound.playPhaseAlert('shooting');
    this.sound.startBGM('shooting');
    this.showTransitionText(`WAVE ${this.stage}`, 1.8);
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

    // ESCキーでいつでもタイトル画面に戻る
    if (input.justEscape && (this.state === 'PLAYING' || this.state === 'STAGE_CLEAR')) {
      this.sound.stopBGM();
      this.state = 'TITLE';
      this.fallingPieces = [];
      this.battlePiece = null;
      this.enemies = [];
      this.playerBullets = [];
      input.resetPerFrame();
      return;
    }

    this.starfield.update(dt, this.phase === 'SHOOTING' ? 2.4 : 1.2);
    this.particles.update(dt);

    if (this.transitionAlpha > 0) {
      this.transitionAlpha -= dt * 0.9;
    }

    switch (this.state) {
      case 'TITLE':
        if (input.shoot || input.isMouseDown) {
          this.startNewGame();
        }
        break;

      case 'PLAYING':
        this.updatePlaying(dt, input);
        break;

      case 'STAGE_CLEAR':
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          if (this.stage >= MAX_STAGES) {
            this.state = 'VICTORY';
            this.sound.playVictory();
          } else {
            this.stage++;
            this.state = 'PLAYING';
            this.startTetrisPhase();
          }
        }
        break;

      case 'GAMEOVER':
      case 'VICTORY':
        this.stateTimer -= dt;
        if (this.stateTimer <= 0 && (input.shoot || input.isMouseDown)) {
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
      this.deathDelay += dt;
      if (this.deathDelay >= 0.65) {
        this.triggerGameOver();
      }
    }
  }

  // ==========================================
  // パズルフェーズ（1個降下：集中してドッキング！）
  // ==========================================
  private spawnTetrominoes(): void {
    const types: TetrominoType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
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
    // 1. 自機の操作（エクセリオン風慣性移動）
    this.player.updateMovement(dt, input);

    // 2. 自機ショット発射（弾を撃って落下中ミノに当てる！）
    if ((input.shoot || input.isMouseDown) && this.player.fireCooldown <= 0) {
      const newBullets = this.player.shootBullets(this.playerBullets);
      if (newBullets.length > 0) {
        this.playerBullets.push(...newBullets);
        this.sound.playShoot();
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

    // 3. 落下中ミノの自律ドリフト移動＆弾との衝突回転判定
    for (const item of this.fallingPieces) {
      if (item.settled) continue;

      item.fallTimer += dt;

      // ユーザー要望：落ちてくるブロックも多少の加速減速をする（宇宙船プローブのような浮遊・加減速ダイナミクス）
      // 縦速度：32px/s〜58px/s で緩やかに周期変動（加速・減速のうねり）
      const targetVy = 44 + Math.sin(item.fallTimer * 2.2) * 16;
      // 横速度：左右にゆったりスウィングしながら漂う
      const targetVx = (item.vx >= 0 ? 1 : -1) * (32 + Math.cos(item.fallTimer * 1.6) * 14);

      item.vx = targetVx;
      item.vy = targetVy;

      // 移動適用
      item.x += item.vx * dt;
      item.y += item.vy * dt;

      // 画面左右端で反転バウンド
      if (item.x < 20) {
        item.x = 20;
        item.vx = Math.abs(item.vx);
      } else if (item.x > CANVAS_WIDTH - 20 - BLOCK_SIZE * 3) {
        item.x = CANVAS_WIDTH - 20 - BLOCK_SIZE * 3;
        item.vx = -Math.abs(item.vx);
      }

      item.gx = Math.round(item.x / BLOCK_SIZE);
      item.gy = Math.round(item.y / BLOCK_SIZE);

      // 弾 vs 落下中ミノの回転判定！
      // ユーザー要望：弾を当てると90度回転！左側ヒットなら時計回り、右側ヒットなら反時計回り
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
          this.particles.emitSparks(pb.x, pb.y, item.piece.color, 10);
          this.sound.playHit();

          if (pb.x < pieceCenterX) {
            item.piece.rotate(); // 左側ヒット：時計回り（右回転）
          } else {
            item.piece.rotateCounter(); // 右側ヒット：反時計回り（左回転）
          }
        }
      }

      // 4. 自機との接触・近接スナップ合体判定！
      const playerBounds = this.player.getBoundingBox();
      const isClose =
        pieceBounds.maxX >= playerBounds.minX - 10 &&
        pieceBounds.minX <= playerBounds.maxX + 10 &&
        pieceBounds.maxY >= playerBounds.minY - 10 &&
        pieceBounds.minY <= playerBounds.maxY + 10;

      if (isClose) {
        // 自機と一番整合するグリッドにスナップ吸着
        const dockRes = this.player.tryDockFromPixel(item.piece, item.x, item.y);
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

    switch (this.stage) {
      case 1:
        // 【WAVE 1：ギャラガ＆ムーンクレスタ導入編】（ザコ44機！）
        // 美しいS字カーブ、そしてムーンクレスタ名物・不規則に揺れ撃つと2つに分裂するSPLITTING_EYE！
        // 序盤の退屈な空き時間を解消し、切れ目なく敵が次々押し寄せるメリハリ構成に最適化
        for (let k = 0; k < 18; k++) {
          this.enemies.push(new Enemy('GREEN_DRONE', 'STREAM_CURVE', 1 + (k % 4), 2, 0.05, 'S_CURVE_LEFT_TO_RIGHT', k));
        }
        for (let k = 0; k < 16; k++) {
          this.enemies.push(new Enemy('YELLOW_COMMANDER', 'STREAM_CURVE', 2 + (k % 5), 1, 0.45, 'FIGURE_EIGHT', k));
        }
        // ★ ムーンクレスタ分裂敵（間髪入れずに降下）
        for (let i = 0; i < 6; i++) {
          this.enemies.push(new Enemy('SPLITTING_EYE', 'MOON_SPLIT_FLOAT', 2 + (i % 5), 0, 0.8 + i * 0.25));
        }
        break;

      case 2:
        // 【WAVE 2：ゼビウスクランク＆左右クロスストリーム】（ザコ56機！）
        // 左右から交差して降下する大編隊＋ゼビウス風直角クランクのトーロイド！狭窄地形も初登場！
        for (let k = 0; k < 20; k++) {
          this.enemies.push(new Enemy('GREEN_DRONE', 'STREAM_CURVE', 1 + (k % 4), 2, 0.2, 'S_CURVE_LEFT_TO_RIGHT', k));
        }
        for (let k = 0; k < 16; k++) {
          this.enemies.push(new Enemy('RED_GUARD', 'STREAM_CURVE', 5 + (k % 4), 2, 0.5, 'S_CURVE_RIGHT_TO_LEFT', k));
        }
        // ★ ゼビウス風トーロイド
        for (let i = 0; i < 12; i++) {
          this.enemies.push(new Enemy('TOROID_SCOUT', 'XEVIOUS_TOROID', 2 + (i % 5), 1, 1.0 + i * 0.25));
        }
        for (let i = 0; i < 8; i++) {
          this.enemies.push(new Enemy('SPLITTING_EYE', 'MOON_SPLIT_FLOAT', 1 + (i % 6), 0, 2.0 + i * 0.3));
        }
        break;

      case 3:
        // 【WAVE 3：★右スクロール洞窟突破！スターフォース旋回＆噴水迎撃】（ザコ54機！）
        // 右スクロールで上下に天井と床の鍾乳石！高速ダイブするスターフォース敵と噴水編隊！
        for (let i = 0; i < 16; i++) {
          this.enemies.push(new Enemy('GREEN_DRONE', 'STARFORCE_SWOOP', 1 + (i % 6), 0, 0.4 + i * 0.2));
        }
        for (let i = 0; i < 18; i++) {
          this.enemies.push(new Enemy('TOROID_SCOUT', 'XEVIOUS_TOROID', 1 + (i % 6), 1, 0.8 + i * 0.2));
        }
        for (let i = 0; i < 12; i++) {
          this.enemies.push(new Enemy('GREEN_DRONE', 'SURPRISE_FROM_BOTTOM', 1 + (i % 4) * 2, 2, 1.2 + i * 0.15));
        }
        for (let i = 0; i < 8; i++) {
          this.enemies.push(new Enemy('SPLITTING_EYE', 'MOON_SPLIT_FLOAT', 2 + (i % 5), 0, 1.8 + i * 0.3));
        }
        break;

      case 4:
        // 【WAVE 4：ムーンクレスタ名物・激震メテオゾーン！】（ザコ56機！）
        // 天頂から大量の硬い隕石メテオが燃えながら高速乱舞落下！左右横断部隊と挟撃！
        for (let i = 0; i < 28; i++) {
          this.enemies.push(new Enemy('METEOR_ROCK', 'METEOR_FALL', 1 + (i % 8), 0, 0.4 + i * 0.12));
        }
        for (let i = 0; i < 14; i++) {
          this.enemies.push(new Enemy('RED_GUARD', 'SWEEP_FROM_LEFT', 2, 0, 1.6 + i * 0.12));
          this.enemies.push(new Enemy('RED_GUARD', 'SWEEP_FROM_RIGHT', 7, 1, 2.4 + i * 0.12));
        }
        break;

      case 5:
        // 【WAVE 5：中ボス前哨戦 ＆ 左右X字クロススプリット大交差】（ザコ60機！）
        // 左右上空から対角線に超高速で交差突進する怒涛のスプリット部隊＋インフィニティ宙返り！
        for (let k = 0; k < 18; k++) {
          this.enemies.push(new Enemy('GREEN_DRONE', 'STREAM_CURVE', 1 + (k % 5), 3, 0.2, 'INFINITY_DIVE_LEFT', k));
          this.enemies.push(new Enemy('RED_GUARD', 'STREAM_CURVE', 4 + (k % 5), 3, 0.2, 'INFINITY_DIVE_RIGHT', k));
        }
        for (let i = 0; i < 12; i++) {
          this.enemies.push(new Enemy('YELLOW_COMMANDER', 'CROSS_SPLIT', 1, 0, 1.2 + i * 0.13));
          this.enemies.push(new Enemy('YELLOW_COMMANDER', 'CROSS_SPLIT', 7, 0, 1.2 + i * 0.13));
        }
        break;

      case 6:
        // 【WAVE 6：四方包囲網（左右横断＋下噴出＋メテオのトリプル猛攻）】（ザコ64機！）
        // 上からメテオ、下から噴出、左右から大型艦スイープが同時に押し寄せる！
        for (let i = 0; i < 20; i++) {
          this.enemies.push(new Enemy('METEOR_ROCK', 'METEOR_FALL', 1 + (i % 8), 0, 0.4 + i * 0.13));
        }
        for (let i = 0; i < 20; i++) {
          this.enemies.push(new Enemy('GREEN_DRONE', 'SURPRISE_FROM_BOTTOM', 1 + (i % 7) * 2, 2, 1.0 + i * 0.11));
        }
        for (let i = 0; i < 12; i++) {
          this.enemies.push(new Enemy('GIANT_RED', 'SWEEP_FROM_LEFT', 2, 0, 2.0 + i * 0.15));
          this.enemies.push(new Enemy('GIANT_YELLOW', 'SWEEP_FROM_RIGHT', 7, 0, 2.8 + i * 0.15));
        }
        break;

      case 7:
        // 【WAVE 7：カミソリ急降下ジグザグストーム ＆ インフィニティ大乱舞】（ザコ68機！）
        // 左右に激しく身をよじりながら切り込むジグザグ編隊の大群！
        for (let k = 0; k < 20; k++) {
          this.enemies.push(new Enemy('GREEN_DRONE', 'STREAM_CURVE', 1 + (k % 4), 3, 0.15, 'INFINITY_DIVE_LEFT', k));
          this.enemies.push(new Enemy('RED_GUARD', 'STREAM_CURVE', 4 + (k % 4), 3, 0.15, 'INFINITY_DIVE_RIGHT', k));
        }
        for (let i = 0; i < 24; i++) {
          this.enemies.push(new Enemy('YELLOW_COMMANDER', 'ZIGZAG_DIVE', 1 + (i % 8), 1, 1.0 + i * 0.11));
        }
        this.enemies.push(new Enemy('GIANT_RED', 'FORMATION_LOOP', 2, 0, 0.4));
        this.enemies.push(new Enemy('GIANT_RED', 'FORMATION_LOOP', 4, 0, 0.4));
        this.enemies.push(new Enemy('GIANT_RED', 'FORMATION_LOOP', 6, 0, 0.4));
        this.enemies.push(new Enemy('GIANT_RED', 'FORMATION_LOOP', 3, 0, 0.6));
        break;

      case 8:
        // 【WAVE 8：流星雨メテオシャワー ＆ 地獄の噴水編隊】（ザコ76機！）
        // 上空からは怒涛のメテオ群、下からは息つく暇もない噴水エイリアン！
        for (let i = 0; i < 30; i++) {
          this.enemies.push(new Enemy('METEOR_ROCK', 'METEOR_FALL', 1 + (i % 8), 0, 0.3 + i * 0.1));
        }
        for (let i = 0; i < 30; i++) {
          this.enemies.push(new Enemy('GREEN_DRONE', 'SURPRISE_FROM_BOTTOM', 1 + (i % 8), 2, 0.8 + i * 0.1));
        }
        for (let i = 0; i < 16; i++) {
          this.enemies.push(new Enemy('GIANT_YELLOW', 'SWEEP_FROM_LEFT', 2, 0, 2.2 + i * 0.12));
        }
        break;

      case 9:
        // 【WAVE 9：全方位総攻撃前夜（全パターン同時展開・フルキャスト）】（ザコ86機！）
        // メテオ、ジグザグ、スプリット、左右スイープ、下噴出の全方位同時波状攻撃！
        for (let k = 0; k < 20; k++) {
          this.enemies.push(new Enemy('GREEN_DRONE', 'STREAM_CURVE', 1 + (k % 6), 3, 0.15, 'INFINITY_DIVE_LEFT', k));
          this.enemies.push(new Enemy('RED_GUARD', 'STREAM_CURVE', 3 + (k % 5), 3, 0.15, 'INFINITY_DIVE_RIGHT', k));
        }
        for (let i = 0; i < 20; i++) {
          this.enemies.push(new Enemy('METEOR_ROCK', 'METEOR_FALL', 1 + (i % 8), 0, 0.5 + i * 0.11));
        }
        for (let i = 0; i < 20; i++) {
          this.enemies.push(new Enemy('YELLOW_COMMANDER', 'ZIGZAG_DIVE', 1 + (i % 8), 2, 1.0 + i * 0.11));
        }
        for (let i = 0; i < 13; i++) {
          this.enemies.push(new Enemy('GIANT_RED', 'SWEEP_FROM_LEFT', 2, 0, 1.8 + i * 0.12));
          this.enemies.push(new Enemy('GIANT_RED', 'SWEEP_FROM_RIGHT', 7, 0, 1.8 + i * 0.12));
        }
        break;

      case 10:
      default:
        // 【WAVE 10：最終決戦・怒涛のギャラクティク・カタストロフィ！】（ザコ100機超え！）
        // 上・下・左・右から息つく暇もない怒涛の総力戦！
        for (let k = 0; k < 24; k++) {
          this.enemies.push(new Enemy('GREEN_DRONE', 'STREAM_CURVE', 1 + (k % 4), 3, 0.1, 'INFINITY_DIVE_LEFT', k));
          this.enemies.push(new Enemy('RED_GUARD', 'STREAM_CURVE', 4 + (k % 4), 3, 0.1, 'INFINITY_DIVE_RIGHT', k));
        }
        for (let i = 0; i < 24; i++) {
          this.enemies.push(new Enemy('METEOR_ROCK', 'METEOR_FALL', 1 + (i % 8), 0, 0.3 + i * 0.09));
        }
        for (let i = 0; i < 24; i++) {
          this.enemies.push(new Enemy('YELLOW_COMMANDER', 'SURPRISE_FROM_BOTTOM', 1 + (i % 8), 2, 0.6 + i * 0.09));
        }
        for (let i = 0; i < 14; i++) {
          this.enemies.push(new Enemy('GIANT_YELLOW', 'SWEEP_FROM_LEFT', 1, 0, 1.4 + i * 0.11));
          this.enemies.push(new Enemy('GIANT_YELLOW', 'SWEEP_FROM_RIGHT', 7, 0, 1.4 + i * 0.11));
        }
        this.enemies.push(new Enemy('GIANT_RED', 'FORMATION_LOOP', 2, 0, 0.4));
        this.enemies.push(new Enemy('GIANT_RED', 'FORMATION_LOOP', 4, 0, 0.4));
        this.enemies.push(new Enemy('GIANT_RED', 'FORMATION_LOOP', 6, 0, 0.4));
        this.enemies.push(new Enemy('GIANT_RED', 'FORMATION_LOOP', 3, 0, 0.5));
        this.enemies.push(new Enemy('GIANT_RED', 'FORMATION_LOOP', 5, 0, 0.5));
        break;
    }
  }

  private spawnWaveBoss(): void {
    this.bossSpawned = true;
    this.sound.playPhaseAlert('shooting');
    this.showTransitionText(`WARNING: BOSS APPROACHING`, 1.2);

    let bossRank: 'GIANT_YELLOW' | 'GIANT_RED' | 'UFO_MOTHERSHIP' = 'GIANT_YELLOW';
    let bossHp = 5;

    if (this.stage === 10) {
      // 最終面ラスボス：最強UFO母船（HPさらに倍：112！）
      bossRank = 'UFO_MOTHERSHIP';
      bossHp = 112;
    } else if (this.stage === 5) {
      // 5面中ボス：超大型UFO母船（HPさらに倍：72！）
      bossRank = 'UFO_MOTHERSHIP';
      bossHp = 72;
    } else if (this.stage >= 6) {
      // 6〜9面ボス：超高速頑強ジャイアントレッド（HPさらに倍：40〜52！）
      bossRank = 'GIANT_RED';
      bossHp = (10 + (this.stage - 6) * 2) * 4;
    } else if (this.stage >= 3) {
      // 3〜4面ボス：ジャイアントレッド（HPさらに倍：32〜44！）
      bossRank = 'GIANT_RED';
      bossHp = (7 + this.stage) * 4;
    } else {
      // 1〜2面ボス：ジャイアントイエロー司令機（HPさらに倍：20〜32！）
      bossRank = 'GIANT_YELLOW';
      bossHp = this.stage === 1 ? 20 : 32;
    }

    const pattern = this.stage === 10 ? 'CAROUSEL_CIRCLE' : 'FORMATION_LOOP';
    const boss = new Enemy(bossRank, pattern, 4, 0, 0.1, undefined, 0, true, bossHp);
    boss.scoreValue = 3000 + this.stage * 1000;
    this.currentBoss = boss;
    this.enemies.push(boss);

    // 護衛を2機随伴（高ステージ）
    if (this.stage >= 4) {
      this.enemies.push(new Enemy('YELLOW_COMMANDER', 'SWEEP_FROM_LEFT', 2, 1, 0.3));
      this.enemies.push(new Enemy('YELLOW_COMMANDER', 'SWEEP_FROM_RIGHT', 6, 1, 0.3));
    }
  }

  private updateShootingPhase(dt: number, input: Input): void {
    // ★ ボス撃破後の爆発鑑賞ディレイ処理
    if (this.bossDying) {
      this.bossDeathTimer += dt;
      if (this.bossDeathTimer >= 1.2) {
        // ★ ユーザー要望：落下中ブロックがある場合はそれが落ちきる（または合体する）までクリアにさせない！
        if (!this.battlePiece || this.battlePiece.settled) {
          this.bossDying = false;
          this.clearStage();
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
        this.sound.playShoot();
        this.player.fireCooldown = PLAYER_FIRE_INTERVAL;
      }
    }

    // 地形（洞窟壁）のスクロール更新
    this.terrain.update(dt, this.phase === 'SHOOTING' ? 140 : 60);

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
            this.terrainHitCooldown = 0.35; // 0.35秒の無敵・クールダウンで連続即死を完全防止

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

    // プレイヤー弾の更新 ＆ 要望④：自分の弾は自身とぶつかっても消える（自傷ダメージなし）
    const playerCells = this.player.getOccupiedCells();
    for (let i = this.playerBullets.length - 1; i >= 0; i--) {
      const b = this.playerBullets[i];
      b.update(dt);

      // 自弾 vs 自機ブロック吸収判定（弾消滅、自機ノーダメージ）
      if (!b.isDead) {
        for (const cell of playerCells) {
          const cx = cell.gx * BLOCK_SIZE;
          const cy = cell.gy * BLOCK_SIZE;
          if (b.x >= cx && b.x <= cx + BLOCK_SIZE && b.y >= cy && b.y <= cy + BLOCK_SIZE) {
            b.isDead = true;
            this.particles.emitSparks(b.x, b.y, b.color, 4);
            break;
          }
        }
      }

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

    // 敵の更新（弾なし・体当たりのみ！ 面が進むごとに同時急降下数が増加して激化）
    const divingCount = this.enemies.filter(e => e.pattern === 'KAMIKAZE_DIVE').length;
    const maxDiving = Math.min(8, 2 + this.stage);
    const canDive = divingCount < maxDiving;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const justDived = e.update(dt, this.formationOffsetAngle, this.player.anchorX, this.player.anchorY, canDive);
      if (justDived) {
        this.sound.playDiveSiren();
      }
      if (e.isDead) {
        this.enemies.splice(i, 1);
      }
    }

    // ★ ウェーブ後半または通常敵が減ったらボス出現！（中だるみをなくし、テンポよくボス戦へ突入）
    if (!this.bossSpawned && (this.shootingTimeLimit <= 32 || this.enemies.length <= 6)) {
      this.spawnWaveBoss();
    }

    // プレイヤー弾 vs 敵
    for (let i = this.playerBullets.length - 1; i >= 0; i--) {
      const pb = this.playerBullets[i];
      if (pb.isDead) continue;

      for (const enemy of this.enemies) {
        if (enemy.isDead) continue;

        if (
          Math.abs(pb.x - (enemy.x + enemy.width / 2)) < (pb.width + enemy.width) / 2 &&
          Math.abs(pb.y - (enemy.y + enemy.height / 2)) < (pb.height + enemy.height) / 2
        ) {
          pb.isDead = true;
          this.particles.emitSparks(pb.x, pb.y, pb.color, 8);

          const killed = enemy.hit(1);
          if (killed) {
            // 要望①：ムーンクレスタ名物 SPLITTING_EYE が撃破されたら2つの MINI_EYE に分裂！
            if (enemy.rank === 'SPLITTING_EYE') {
              this.sound.playExplosion(false);
              this.particles.emitExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ff0055', 18);
              const mini1 = new Enemy('MINI_EYE', 'MOON_SPLIT_FLOAT', 0, 0, 0);
              mini1.x = enemy.x - 12;
              mini1.y = enemy.y;
              mini1.vx = -90;
              mini1.vy = 65;

              const mini2 = new Enemy('MINI_EYE', 'MOON_SPLIT_FLOAT', 0, 0, 0);
              mini2.x = enemy.x + 12;
              mini2.y = enemy.y;
              mini2.vx = 90;
              mini2.vy = 65;

              this.enemies.push(mini1, mini2);
              this.score += enemy.scoreValue;
              break;
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
              this.currentBoss = null;
              this.bossDying = true;
              this.bossDeathTimer = 0;
              this.hitStopTimer = 0.08;
              this.screenShake = 14;
              return;
            } else {
              this.sound.playExplosion(isGiant);
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
      this.clearStage();
    }
  }

  private clearStage(): void {
    this.sound.stopBGM();
    this.sound.playVictory();
    this.state = 'STAGE_CLEAR';
    this.stateTimer = 2.5;
    this.score += 1000 * this.stage;
    this.showTransitionText(`STAGE ${this.stage} CLEAR!`);
  }

  private triggerGameOver(): void {
    this.sound.stopBGM();
    this.sound.playGameOver(); // ムーンクレスタ風 哀愁下降アルペジオ！
    this.state = 'GAMEOVER';
    this.stateTimer = 2.2;
    this.showTransitionText('GAME OVER');
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
          item.piece.drawCell(ctx, px, py);
        }

        // ガイド用の淡い光彩枠
        const bounds = item.piece.getBoundingBox(item.x, item.y);
        ctx.save();
        ctx.strokeStyle = item.piece.color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(bounds.minX - 2, bounds.minY - 2, bounds.maxX - bounds.minX + 4, bounds.maxY - bounds.minY + 4);
        ctx.restore();
      }

      // ★ ムーンクレスタ完全再現：「ドッキングせよ！」をシアン色ピクセルで描画！
      const blink = Math.sin(Date.now() / 200) > -0.7;
      if (blink) {
        drawMoonCrestaText(ctx, 'ドッキングせよ！', CANVAS_WIDTH / 2, 115, 36, '#00f0ff');
      }
    } else if (this.phase === 'SHOOTING') {
      // ★ シューティング時は「WAVE 1」を大きくピクセルフォントで描画！
      const blink = Math.sin(Date.now() / 220) > -0.5;
      if (blink) {
        drawMoonCrestaText(ctx, `WAVE ${this.stage}`, CANVAS_WIDTH / 2, 70, 32, '#ff3366');
      }
    }

    // ★ 要望③：切断されて浮遊・落下中のパーツ描画（点滅しながら落下）
    for (const dp of this.detachedPieces) {
      const alpha = Math.sin(dp.lifeTime * 8) > 0 ? 0.9 : 0.5;
      for (const cell of dp.piece.cells) {
        const px = dp.x + cell.gx * BLOCK_SIZE;
        const py = dp.y + cell.gy * BLOCK_SIZE;
        dp.piece.drawCell(ctx, px, py, undefined, alpha);
      }
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

    // 7. フェーズ切り替えバナー（WAVE開始時は超巨大サイズで迫力満点！）
    if (this.transitionAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.transitionAlpha);
      const isWaveBanner = this.transitionText.startsWith('WAVE');
      const boxHeight = isWaveBanner ? 130 : 90;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
      ctx.fillRect(0, CANVAS_HEIGHT / 2 - boxHeight / 2, CANVAS_WIDTH, boxHeight);

      if (isWaveBanner) {
        // 超特大の迫力アーケードフォント
        const fontSize = Math.floor(64 * this.transitionScale);
        ctx.font = `900 ${fontSize}px "Impact", "Arial Black", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 立体シャドウ
        ctx.fillStyle = '#440011';
        ctx.fillText(this.transitionText, CANVAS_WIDTH / 2 + 4, CANVAS_HEIGHT / 2 + 4);

        // ネオンレッド発光
        const grad = ctx.createLinearGradient(0, CANVAS_HEIGHT / 2 - 35, 0, CANVAS_HEIGHT / 2 + 35);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.3, '#ff3366');
        grad.addColorStop(1, '#ff0033');

        ctx.fillStyle = grad;
        ctx.shadowColor = '#ff2255';
        ctx.shadowBlur = 24;
        ctx.fillText(this.transitionText, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.strokeText(this.transitionText, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
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

    // 8. タイトル・ゲームオーバーオーバーレイ
    this.drawOverlays(ctx);
  }

  private drawOverlays(ctx: CanvasRenderingContext2D): void {
    if (this.state === 'TITLE') {
      ctx.save();
      ctx.fillStyle = 'rgba(2, 4, 8, 0.92)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // 1. 凝ったメインロゴ（Galaxtris ＋ ギャラクトリス）
      this.drawCoolTitleLogo(ctx, CANVAS_WIDTH / 2, 210);

      // 2. 超シンプルで簡潔な説明文
      ctx.textAlign = 'center';
      ctx.font = 'bold 15px "DotGothic16", "Courier New", monospace';
      ctx.fillStyle = '#00ffcc';
      ctx.shadowColor = '#00ffcc';
      ctx.shadowBlur = 8;
      ctx.fillText('ブロックを合体して全方位ビームでエイリアンを撃破せよ！', CANVAS_WIDTH / 2, 390);

      ctx.font = '13px "DotGothic16", sans-serif';
      ctx.fillStyle = '#8b949e';
      ctx.shadowBlur = 0;
      ctx.fillText('ESCキーでいつでもタイトルに戻れます', CANVAS_WIDTH / 2, 430);

      // 3. スタートプロンプト
      const blink = Math.sin(Date.now() / 250) > 0;
      if (blink) {
        ctx.font = 'bold 18px "Courier New", monospace';
        ctx.fillStyle = '#ffea00';
        ctx.shadowColor = '#ffea00';
        ctx.shadowBlur = 10;
        ctx.fillText('PRESS SPACE OR CLICK TO START', CANVAS_WIDTH / 2, 510);
      }

      // 4. 画面最下部に往年のNAMCO風「MUKKII」作者ロゴ！
      this.drawNamcoStyleMukkiiLogo(ctx, CANVAS_WIDTH / 2, 635);

      ctx.restore();
    } else if (this.state === 'GAMEOVER') {
      ctx.save();
      ctx.fillStyle = 'rgba(20, 0, 0, 0.85)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.textAlign = 'center';
      ctx.font = '900 44px monospace';
      ctx.fillStyle = '#ff2244';
      ctx.shadowColor = '#ff0033';
      ctx.shadowBlur = 20;
      ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, 300);

      ctx.font = 'bold 20px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 0;
      ctx.fillText(`FINAL SCORE: ${this.score}`, CANVAS_WIDTH / 2, 360);
      ctx.fillText(`REACHED STAGE: ${this.stage} / ${MAX_STAGES}`, CANVAS_WIDTH / 2, 400);

      if (this.stateTimer <= 0) {
        ctx.font = '16px monospace';
        ctx.fillStyle = '#ffee00';
        ctx.fillText('PRESS SPACE TO RETRY', CANVAS_WIDTH / 2, 480);
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

    ctx.restore(); // screenShakeのctx.save()に対応
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

  // 画面下に往年のNAMCO風「MUKKII」作者ロゴを描画（細くクッキリ読みやすく！）
  private drawNamcoStyleMukkiiLogo(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.save();
    ctx.textAlign = 'center';

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

    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.fillStyle = '#8b949e';
    ctx.shadowBlur = 0;
    ctx.fillText('© 2026 MUKKII ALL RIGHTS RESERVED', cx, cy + 24);

    ctx.font = '9px monospace';
    ctx.fillStyle = '#556677';
    ctx.fillText('VER 3.0 (TERRAIN & EXERION MECHANICS)', cx, cy + 38);

    ctx.restore();
  }
}
