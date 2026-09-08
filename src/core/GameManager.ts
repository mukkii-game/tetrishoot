import {
  BLOCK_SIZE,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  GRID_COLS,
  GRID_ROWS,
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

export type GameState = 'TITLE' | 'PLAYING' | 'STAGE_CLEAR' | 'GAMEOVER' | 'VICTORY';
export type GamePhase = 'TETRIS' | 'SHOOTING';

// 落ちてくるブロックの状態
export interface FallingPieceItem {
  index: number;
  piece: TetrominoPiece;
  gx: number;
  gy: number;
  fallTimer: number;
  settled: boolean;
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

  // バトル中に時々落ちてくる回転不可ブロック（1ウェーブに1回程度）
  public battlePiece: FallingPieceItem | null = null;
  private battlePieceTimer = 0;
  private hasSpawnedBattlePieceThisWave = false;

  private deathDelay = 0; // 自機爆発アニメーション用ディレイ
  private stateTimer = 0;
  private transitionAlpha = 0;
  private transitionText = '';
  private transitionScale = 1.0;
  private keyRepeatTimer = 0;

  constructor(sound: Sound) {
    this.sound = sound;
    this.player = new Player();
    this.starfield = new Starfield();
    this.particles = new ParticleManager();
  }

  public startNewGame(): void {
    this.stage = 1;
    this.score = 0;
    this.deathDelay = 0;
    this.player = new Player();
    this.particles.clear();
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
    this.battlePiece = null;
    this.battlePieceTimer = 0;
    this.hasSpawnedBattlePieceThisWave = false;
    this.bossSpawned = false;
    this.currentBoss = null;
    this.bossDying = false;
    this.bossDeathTimer = 0;

    // ギャラガ＆ムーンクレスタ風 多彩な大編隊をスポーン！
    this.spawnAlienFleet();

    this.sound.playPhaseAlert('shooting');
    this.sound.startBGM('shooting');
    // デストロイゼムオールのかわりに「WAVE 1」と超巨大表示！
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

    // 中央付近（列7）から降下
    const type = types[Math.floor(Math.random() * types.length)];
    const piece = new TetrominoPiece(type);

    const r = Math.floor(Math.random() * 4);
    for (let k = 0; k < r; k++) piece.rotate();

    this.fallingPieces.push({
      index: 0,
      piece,
      gx: 7,
      gy: 0,
      fallTimer: 0,
      settled: false,
    });

    this.activePieceIndex = 0;
  }

  private updateTetrisPhase(dt: number, input: Input): void {
    // 操作ブロックの切り替え
    if (input.selectedPieceIndex !== null) {
      if (this.fallingPieces[input.selectedPieceIndex] && !this.fallingPieces[input.selectedPieceIndex].settled) {
        this.activePieceIndex = input.selectedPieceIndex;
      }
    } else if (input.justTab) {
      this.cycleActivePiece();
    }

    // マウスクリックでのブロック選択
    if (input.hasMouseMoved && input.isMouseDown && input.mouseX !== null) {
      const mgx = Math.floor(input.mouseX / BLOCK_SIZE);
      for (const item of this.fallingPieces) {
        if (!item.settled) {
          for (const cell of item.piece.cells) {
            if (item.gx + cell.gx === mgx) {
              this.activePieceIndex = item.index;
              break;
            }
          }
        }
      }
    }

    const activeItem = this.fallingPieces[this.activePieceIndex];
    if (!activeItem || activeItem.settled) {
      this.cycleActivePiece();
    }

    const currentItem = this.fallingPieces[this.activePieceIndex];

    // 操作中のブロック移動
    if (currentItem && !currentItem.settled) {
      let moveDir = 0;
      if (input.justLeft) moveDir = -1;
      else if (input.justRight) moveDir = 1;
      else if (input.left || input.right) {
        this.keyRepeatTimer += dt;
        if (this.keyRepeatTimer > 0.2) {
          moveDir = input.left ? -1 : 1;
          this.keyRepeatTimer = 0.12;
        }
      } else {
        this.keyRepeatTimer = 0;
      }

      if (moveDir !== 0) {
        const nextGx = currentItem.gx + moveDir;
        if (this.canPlace(currentItem.piece, nextGx, currentItem.gy, currentItem)) {
          currentItem.gx = nextGx;
          this.checkInstantDock(currentItem);
        }
      }

      // 回転
      if (input.justRotate) {
        currentItem.piece.rotate();
        if (!this.canPlace(currentItem.piece, currentItem.gx, currentItem.gy, currentItem)) {
          if (this.canPlace(currentItem.piece, currentItem.gx - 1, currentItem.gy, currentItem)) {
            currentItem.gx--;
          } else if (this.canPlace(currentItem.piece, currentItem.gx + 1, currentItem.gy, currentItem)) {
            currentItem.gx++;
          } else {
            currentItem.piece.rotateCounter();
          }
        }
        this.checkInstantDock(currentItem);
      }
    }

    // 3つのブロックの自然落下
    for (const item of this.fallingPieces) {
      if (item.settled) continue;

      const isActive = item.index === this.activePieceIndex;
      const isFastDrop = isActive && (input.down || input.justDrop);
      const dropInterval = isFastDrop ? 0.05 : 0.65;

      item.fallTimer += dt;
      if (item.fallTimer >= dropInterval) {
        item.fallTimer = 0;
        const nextGy = item.gy + 1;

        if (this.canPlace(item.piece, item.gx, nextGy, item)) {
          item.gy = nextGy;
          this.checkInstantDock(item);
        } else {
          this.resolvePiecePlacement(item);
        }
      }
    }

    const remaining = this.fallingPieces.filter(p => !p.settled).length;
    this.remainingPiecesCount = remaining;

    // 3つ落とし終わったら即座にバトルへ突入！
    if (remaining === 0) {
      this.startShootingPhase();
    }
  }

  private cycleActivePiece(): void {
    const unsettled = this.fallingPieces.filter(p => !p.settled);
    if (unsettled.length === 0) return;

    let nextIdx = (this.activePieceIndex + 1) % 2;
    for (let i = 0; i < 2; i++) {
      if (this.fallingPieces[nextIdx] && !this.fallingPieces[nextIdx].settled) {
        this.activePieceIndex = nextIdx;
        return;
      }
      nextIdx = (nextIdx + 1) % 2;
    }
  }

  // 重なり判定（画面端と自機、他の落下中ブロックとの衝突）
  private canPlace(piece: TetrominoPiece, gx: number, gy: number, selfItem: FallingPieceItem): boolean {
    const myCells = this.player.getOccupiedCells();

    for (const cell of piece.cells) {
      const testGx = gx + cell.gx;
      const testGy = gy + cell.gy;

      // 画面左右端（壁がないので0〜GRID_COLS-1まで完全に利用可能）
      if (testGx < 0 || testGx >= GRID_COLS) return false;
      if (testGy >= GRID_ROWS - 1) return false;

      for (const mc of myCells) {
        if (mc.gx === testGx && mc.gy === testGy) return false;
      }

      for (const other of this.fallingPieces) {
        if (other !== selfItem && !other.settled) {
          for (const oc of other.piece.cells) {
            if (other.gx + oc.gx === testGx && other.gy + oc.gy === testGy) {
              return false;
            }
          }
        }
      }
    }
    return true;
  }

  // 自機との接触即確定
  private checkInstantDock(item: FallingPieceItem): boolean {
    if (item.settled) return false;

    const dockResult = this.player.tryDock(item.piece, item.gx, item.gy);
    if (dockResult.docked) {
      item.settled = true;
      this.sound.playDock(); // ムーンクレスタ風ピロピロピロ！
      const px = (item.gx + 1) * BLOCK_SIZE;
      const py = (item.gy + 1) * BLOCK_SIZE;
      this.particles.emitDockRing(px, py, item.piece.color);
      this.score += 300;
      this.cycleActivePiece();
      return true;
    }

    return false;
  }

  private resolvePiecePlacement(item: FallingPieceItem): void {
    if (!this.checkInstantDock(item)) {
      // スルー：床で粉砕消滅
      item.settled = true;
      const px = (item.gx + 1) * BLOCK_SIZE;
      const py = (item.gy + 1) * BLOCK_SIZE;
      this.sound.playExplosion(false);
      this.particles.emitExplosion(px, py, item.piece.color, 14);
      this.cycleActivePiece();
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
        // 【WAVE 1：ギャラガ導入編】（ザコ44機！）
        // 美しいS字カーブと8の字ループ。軌道が流麗で、連射でなぎ倒す基本面！
        for (let k = 0; k < 24; k++) {
          this.enemies.push(new Enemy('GREEN_DRONE', 'STREAM_CURVE', 1 + (k % 4), 2, 0.2, 'S_CURVE_LEFT_TO_RIGHT', k));
        }
        for (let k = 0; k < 20; k++) {
          this.enemies.push(new Enemy('YELLOW_COMMANDER', 'STREAM_CURVE', 2 + (k % 5), 1, 1.2, 'FIGURE_EIGHT', k));
        }
        break;

      case 2:
        // 【WAVE 2：左右クロスストリーム ＆ ジグザグ急降下】（ザコ56機！）
        // 左右から交差して降下する大編隊＋電光石火のジグザグ急降下奇襲！
        for (let k = 0; k < 20; k++) {
          this.enemies.push(new Enemy('GREEN_DRONE', 'STREAM_CURVE', 1 + (k % 4), 2, 0.2, 'S_CURVE_LEFT_TO_RIGHT', k));
        }
        for (let k = 0; k < 20; k++) {
          this.enemies.push(new Enemy('RED_GUARD', 'STREAM_CURVE', 5 + (k % 4), 2, 0.5, 'S_CURVE_RIGHT_TO_LEFT', k));
        }
        for (let i = 0; i < 16; i++) {
          this.enemies.push(new Enemy('YELLOW_COMMANDER', 'ZIGZAG_DIVE', 1 + (i % 7), 1, 1.4 + i * 0.14));
        }
        break;

      case 3:
        // 【WAVE 3：下からの噴水地獄 ＆ 8の字挟み撃ち】（ザコ52機！）
        // 画面下から猛烈な勢いで噴き上がる噴水ストリーム！下向きビーム大活躍！
        for (let k = 0; k < 20; k++) {
          this.enemies.push(new Enemy('RED_GUARD', 'STREAM_CURVE', 2 + (k % 5), 1, 0.2, 'FIGURE_EIGHT', k));
        }
        // 下からの連隊（16機×2列が噴水のように連続噴出）
        for (let i = 0; i < 16; i++) {
          this.enemies.push(new Enemy('GREEN_DRONE', 'SURPRISE_FROM_BOTTOM', 1 + (i % 4) * 2, 2, 1.0 + i * 0.12));
        }
        for (let i = 0; i < 16; i++) {
          this.enemies.push(new Enemy('GREEN_DRONE', 'SURPRISE_FROM_BOTTOM', 2 + (i % 4) * 2, 2, 2.2 + i * 0.12));
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

    // バトル中のブロック降下管理（1ウェーブに1回程度、約7〜9秒経過時に上から降下）
    this.battlePieceTimer += dt;
    if (!this.hasSpawnedBattlePieceThisWave && this.battlePieceTimer >= 8.0 && !this.battlePiece) {
      const types: TetrominoType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
      const type = types[Math.floor(Math.random() * types.length)];
      const piece = new TetrominoPiece(type);
      const r = Math.floor(Math.random() * 4);
      for (let k = 0; k < r; k++) piece.rotate();

      // ランダムな列から降下開始
      const spawnCol = 2 + Math.floor(Math.random() * (GRID_COLS - 5));
      this.battlePiece = {
        index: 99,
        piece,
        gx: spawnCol,
        gy: -2,
        fallTimer: 0,
        settled: false,
      };
      this.hasSpawnedBattlePieceThisWave = true;
    }

    // バトル中落下ブロックの更新（回転不可、一定速度で落下。プレイヤーが自機を動かして接触ドッキング）
    if (this.battlePiece && !this.battlePiece.settled) {
      this.battlePiece.fallTimer += dt;
      // 0.45秒ごとに1マス下降
      if (this.battlePiece.fallTimer >= 0.45) {
        this.battlePiece.fallTimer = 0;
        this.battlePiece.gy += 1;

        // 自機との接触即ドッキング判定
        if (this.checkInstantDock(this.battlePiece)) {
          this.battlePiece = null;
        } else if (this.battlePiece.gy >= GRID_ROWS - 1) {
          // 底に着いたら粉砕消滅
          const px = (this.battlePiece.gx + 1) * BLOCK_SIZE;
          const py = (this.battlePiece.gy + 1) * BLOCK_SIZE;
          this.sound.playExplosion(false);
          this.particles.emitExplosion(px, py, this.battlePiece.piece.color, 12);
          this.battlePiece = null;
        }
      } else {
        // 落下インターバル中も自機との接触判定
        if (this.checkInstantDock(this.battlePiece)) {
          this.battlePiece = null;
        }
      }
    }

    // 自機ショット（ムーンクレスタ風ピシューン！ 押しっぱなし連射＋各銃口2発制限）
    if ((input.shoot || input.isMouseDown) && this.player.fireCooldown <= 0) {
      const newBullets = this.player.shootBullets(this.playerBullets);
      if (newBullets.length > 0) {
        this.playerBullets.push(...newBullets);
        this.sound.playShoot();
        this.player.fireCooldown = PLAYER_FIRE_INTERVAL;
      }
    }

    // プレイヤー弾の更新
    for (let i = this.playerBullets.length - 1; i >= 0; i--) {
      const b = this.playerBullets[i];
      b.update(dt);
      if (b.isDead) {
        this.playerBullets.splice(i, 1);
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

    // ★ ウェーブ後半または通常敵が減ったらボス出現！（約35秒経過、または敵が残り5機以下）
    if (!this.bossSpawned && (this.shootingTimeLimit <= 30 || this.enemies.length <= 5)) {
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
            const isGiant = enemy.rank.startsWith('GIANT') || enemy.rank === 'UFO_MOTHERSHIP';

            if (enemy === this.currentBoss || enemy.isBoss) {
              // ★ ユーザー要望：ボスのド迫力ヤラレ爆発！
              // 白い四角ではなく、多重巨大パラパラ爆発と轟音を発生させ、爆発をしっかり見せてからクリア！
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
              this.hitStopTimer = isGiant ? 0.05 : 0.025; // マイクロヒットストップ
              this.screenShake = Math.max(this.screenShake, isGiant ? 6 : 2.5);
            }
          } else {
            // 被弾時（ボス等）：手応えのあるマイクロヒットストップと軽い振動
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

    // 2. パズルフェーズ：3つの落下中ブロック
    if (this.phase === 'TETRIS') {
      for (const item of this.fallingPieces) {
        if (item.settled) continue;

        const isActive = item.index === this.activePieceIndex;

        for (const cell of item.piece.cells) {
          const px = (item.gx + cell.gx) * BLOCK_SIZE;
          const py = (item.gy + cell.gy) * BLOCK_SIZE;
          item.piece.drawCell(ctx, px, py);
        }

        if (isActive) {
          ctx.save();
          let ghostGy = item.gy;
          while (this.canPlace(item.piece, item.gx, ghostGy + 1, item)) {
            ghostGy++;
          }
          if (ghostGy > item.gy) {
            ctx.globalAlpha = 0.35;
            for (const cell of item.piece.cells) {
              const gpx = (item.gx + cell.gx) * BLOCK_SIZE;
              const gpy = (ghostGy + cell.gy) * BLOCK_SIZE;
              ctx.strokeStyle = item.piece.color;
              ctx.lineWidth = 1.5;
              ctx.strokeRect(gpx + 1, gpy + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
            }
          }
          ctx.restore();
        }
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

    // 3. 自機
    if (!this.player.isDead) {
      this.player.draw(ctx);
    }

    // ★ バトル中の落下ブロック描画（回転不可・自機を動かしてドッキング！）
    if (this.phase === 'SHOOTING' && this.battlePiece && !this.battlePiece.settled) {
      for (const cell of this.battlePiece.piece.cells) {
        const px = (this.battlePiece.gx + cell.gx) * BLOCK_SIZE;
        const py = (this.battlePiece.gy + cell.gy) * BLOCK_SIZE;
        this.battlePiece.piece.drawCell(ctx, px, py);
      }
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
    ctx.fillText('VER 2.5 (METEOR & WAVE OVERHAUL)', cx, cy + 38);

    ctx.restore();
  }
}
