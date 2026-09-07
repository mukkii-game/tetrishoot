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

  // パズルフェーズ：同時に落ちてくる3つのブロック
  public fallingPieces: FallingPieceItem[] = [];
  public activePieceIndex = 0;
  public remainingPiecesCount = 3;

  // シューティングフェーズ：大編隊
  public playerBullets: PlayerBullet[] = [];
  public enemies: Enemy[] = [];
  public formationOffsetAngle = 0;
  public shootingTimeLimit = 22;

  // バトル中に時々落ちてくる回転不可ブロック（1ウェーブに1回程度）
  public battlePiece: FallingPieceItem | null = null;
  private battlePieceTimer = 0;
  private hasSpawnedBattlePieceThisWave = false;

  private stateTimer = 0;
  private transitionAlpha = 0;
  private transitionText = '';
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

    // 自機を下部中央へ再配置（ドッキングしやすくする）
    this.player.resetToBottomCenter();

    // 1度に3つのブロックをスポーン！
    this.spawnThreeTetrominoes();
    this.remainingPiecesCount = 3;

    this.sound.playStartJingle();
    this.sound.startBGM('tetris');
    this.showTransitionText('ドッキングせよ');
  }

  private startShootingPhase(): void {
    this.phase = 'SHOOTING';
    this.fallingPieces = [];
    this.shootingTimeLimit = 24;
    this.formationOffsetAngle = 0;
    this.battlePiece = null;
    this.battlePieceTimer = 0;
    this.hasSpawnedBattlePieceThisWave = false;

    // ギャラガ＆ムーンクレスタ風 多彩な大編隊をスポーン！
    this.spawnAlienFleet();

    this.sound.playPhaseAlert('shooting');
    this.sound.startBGM('shooting');
    this.showTransitionText('デストロイ　ゼム　オール！');
  }

  private showTransitionText(text: string): void {
    this.transitionText = text;
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
    if (this.phase === 'TETRIS') {
      this.updateTetrisPhase(dt, input);
    } else {
      this.player.updateMovement(dt, input);
      this.updateShootingPhase(dt, input);
    }

    if (this.player.isDead) {
      this.triggerGameOver();
    }
  }

  // ==========================================
  // パズルフェーズ（3個同時降下、左右端までフル画面活用）
  // ==========================================
  private spawnThreeTetrominoes(): void {
    const types: TetrominoType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
    this.fallingPieces = [];

    // 画面全体に分散して3つ降下（左・中央・右）
    const initialCols = [2, 7, 13];

    for (let i = 0; i < 3; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      const piece = new TetrominoPiece(type);

      const r = Math.floor(Math.random() * 4);
      for (let k = 0; k < r; k++) piece.rotate();

      this.fallingPieces.push({
        index: i,
        piece,
        gx: initialCols[i],
        gy: 1 - i * 2,
        fallTimer: 0,
        settled: false,
      });
    }

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

    let nextIdx = (this.activePieceIndex + 1) % 3;
    for (let i = 0; i < 3; i++) {
      if (this.fallingPieces[nextIdx] && !this.fallingPieces[nextIdx].settled) {
        this.activePieceIndex = nextIdx;
        return;
      }
      nextIdx = (nextIdx + 1) % 3;
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
  // シューティングフェーズ：ギャラガ＆ギャプラス＆ムーンクレスタ風の多彩なレベルデザイン！
  // ==========================================
  private spawnAlienFleet(): void {
    this.enemies = [];

    // ステージごとの段階的レベルデザイン
    // 序盤（1〜2面）：倒しやすく気持ちいい、流麗なS字・8の字ループ
    // 中盤（3〜6面）：横からの優雅な合流、下からの上昇が加わり、全方位の武装が欲しくなる
    // 終盤（7〜10面）：左右・下・上からの怒涛の波状攻撃と巨大ボス

    // 1. S字蛇行ストリーム（左から流れる、ギャラガ隊）
    const leftStreamCount = Math.min(8, 5 + this.stage);
    for (let k = 0; k < leftStreamCount; k++) {
      this.enemies.push(
        new Enemy('GREEN_DRONE', 'STREAM_CURVE', 1 + (k % 4), 2, 0.2, 'S_CURVE_LEFT_TO_RIGHT', k)
      );
    }

    // 2. S字蛇行ストリーム（右から流れる）
    if (this.stage >= 2) {
      const rightStreamCount = Math.min(8, 4 + this.stage);
      for (let k = 0; k < rightStreamCount; k++) {
        this.enemies.push(
          new Enemy('RED_GUARD', 'STREAM_CURVE', 5 + (k % 4), 2, 0.8, 'S_CURVE_RIGHT_TO_LEFT', k)
        );
      }
    }

    // 3. ギャラガ名物・8の字ループ連隊（美しい∞を描いて流れる！）
    const loopCount = this.stage === 1 ? 4 : 6;
    for (let k = 0; k < loopCount; k++) {
      this.enemies.push(
        new Enemy('YELLOW_COMMANDER', 'STREAM_CURVE', 2 + (k % 6), 1, 1.4, 'FIGURE_EIGHT', k)
      );
    }

    // 4. 左右交差ダブルインフィニティ急降下連隊（ステージ3以降）
    if (this.stage >= 3) {
      const crossCount = Math.min(5, 2 + this.stage);
      for (let k = 0; k < crossCount; k++) {
        this.enemies.push(
          new Enemy('GREEN_DRONE', 'STREAM_CURVE', 1 + k, 3, 2.0, 'INFINITY_DIVE_LEFT', k)
        );
        this.enemies.push(
          new Enemy('RED_GUARD', 'STREAM_CURVE', 4 + k, 3, 2.0, 'INFINITY_DIVE_RIGHT', k)
        );
      }
    }

    // 5. 左右からの横断スイープ隊（ステージ4以降：左右への迎撃ブロックが真価を発揮）
    if (this.stage >= 4) {
      this.enemies.push(new Enemy('GIANT_YELLOW', 'SWEEP_FROM_LEFT', 2, 0, 1.0));
      if (this.stage >= 6) {
        this.enemies.push(new Enemy('GIANT_RED', 'SWEEP_FROM_RIGHT', 7, 0, 1.5));
      }
    }

    // 6. 画面下からの急上昇サプライズ編隊！（ステージ2以降徐々に増加：下向きビームが重要に）
    if (this.stage >= 2) {
      const bottomCount = Math.min(5, 1 + Math.floor(this.stage / 2));
      for (let i = 0; i < bottomCount; i++) {
        this.enemies.push(new Enemy('GREEN_DRONE', 'SURPRISE_FROM_BOTTOM', 2 + i * 2, 2, 2.8 + i * 0.3));
      }
    }

    // 7. 大型艦＆ボス
    if (this.stage === 10) {
      // ラスボス超大型UFO母船＋護衛
      this.enemies.push(new Enemy('UFO_MOTHERSHIP', 'CAROUSEL_CIRCLE', 4, 0, 0.2));
      this.enemies.push(new Enemy('GIANT_YELLOW', 'SWEEP_FROM_LEFT', 1, 1, 0.5));
      this.enemies.push(new Enemy('GIANT_YELLOW', 'SWEEP_FROM_RIGHT', 7, 1, 0.5));
      this.enemies.push(new Enemy('GIANT_RED', 'FORMATION_LOOP', 3, 0, 0.6));
      this.enemies.push(new Enemy('GIANT_RED', 'FORMATION_LOOP', 5, 0, 0.6));
    } else if (this.stage === 5) {
      // 5面中ボス超大型UFO
      this.enemies.push(new Enemy('UFO_MOTHERSHIP', 'FORMATION_LOOP', 4, 0, 0.2));
      this.enemies.push(new Enemy('GIANT_RED', 'SWEEP_FROM_LEFT', 2, 1, 0.6));
    } else if (this.stage >= 3) {
      // 倍サイズ大型旗艦
      this.enemies.push(new Enemy('GIANT_YELLOW', 'FORMATION_LOOP', 4, 0, 0.2));
      if (this.stage >= 7) {
        this.enemies.push(new Enemy('GIANT_RED', 'FORMATION_LOOP', 5, 0, 0.3));
      }
    }
  }

  private updateShootingPhase(dt: number, input: Input): void {
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

    // 敵の更新（弾なし・体当たりのみ！）
    const divingCount = this.enemies.filter(e => e.pattern === 'KAMIKAZE_DIVE').length;
    const maxDiving = Math.min(5, 2 + Math.floor(this.stage / 2));
    const canDive = divingCount < maxDiving;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dt, this.formationOffsetAngle, this.player.anchorX, this.player.anchorY, canDive);
      if (e.isDead) {
        this.enemies.splice(i, 1);
      }
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
            this.sound.playExplosion(isGiant);
            this.particles.emitExplosion(
              enemy.x + enemy.width / 2,
              enemy.y + enemy.height / 2,
              '#ffaa00',
              isGiant ? 50 : 20,
              isGiant
            );
            this.score += enemy.scoreValue;
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
        enemy.hit(5);
        this.sound.playExplosion(true);
      }
    }

    // クリア判定
    if (this.enemies.length === 0 || this.shootingTimeLimit <= 0) {
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

          ctx.globalAlpha = 1.0;
          ctx.fillStyle = '#00ffff';
          ctx.font = 'bold 12px monospace';
          ctx.fillText(`[${item.index + 1}]`, item.gx * BLOCK_SIZE, item.gy * BLOCK_SIZE - 4);
          ctx.restore();
        } else {
          ctx.save();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.font = '11px monospace';
          ctx.fillText(`[${item.index + 1}]`, item.gx * BLOCK_SIZE, item.gy * BLOCK_SIZE - 4);
          ctx.restore();
        }
      }

      // ★ ムーンクレスタ完全再現：「ドッキングせよ」をシアン色ピクセルで描画！
      const blink = Math.sin(Date.now() / 200) > -0.7;
      if (blink) {
        drawMoonCrestaText(ctx, 'ドッキングせよ', CANVAS_WIDTH / 2, 115, 34, '#00f0ff');
      }
    } else if (this.phase === 'SHOOTING') {
      // ★ シューティング時は「デストロイ　ゼム　オール！」を同じピクセルフォントで描画！
      const blink = Math.sin(Date.now() / 220) > -0.5;
      if (blink) {
        drawMoonCrestaText(ctx, 'デストロイ　ゼム　オール！', CANVAS_WIDTH / 2, 70, 28, '#ff3366');
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

    // 7. フェーズ切り替えバナー
    if (this.transitionAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.transitionAlpha);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(0, CANVAS_HEIGHT / 2 - 45, CANVAS_WIDTH, 90);

      ctx.font = '900 28px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = this.phase === 'TETRIS' ? '#00ffaa' : '#ff3366';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 12;
      ctx.fillText(this.transitionText, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
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
  }

  // かっこいいタイトルロゴ描画（Galaxtris ＋ カタカナ：ギャラクトリス）
  private drawCoolTitleLogo(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.save();
    ctx.textAlign = 'center';

    // 1. 上部アクセント装飾
    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.fillStyle = '#00ffff';
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 6;
    ctx.fillText('★ RETRO ARCADE FUSION ★', cx, cy - 65);

    // 2. 英語メインロゴ「Galaxtris」（重厚で凝ったグラデーション＋立体シャドウ）
    const engText = 'Galaxtris';
    ctx.font = '900 64px "Impact", "Arial Black", sans-serif';

    // 立体深度ドロップシャドウ
    ctx.fillStyle = '#0a0020';
    ctx.fillText(engText, cx + 6, cy + 6);
    ctx.fillStyle = '#220044';
    ctx.fillText(engText, cx + 4, cy + 4);
    ctx.fillStyle = '#660055';
    ctx.fillText(engText, cx + 2, cy + 2);

    // 鮮やかなネオンギャラクシーグラデーション
    const mainGrad = ctx.createLinearGradient(cx, cy - 50, cx, cy + 15);
    mainGrad.addColorStop(0, '#00ffff');
    mainGrad.addColorStop(0.3, '#ffffff');
    mainGrad.addColorStop(0.55, '#ff77aa');
    mainGrad.addColorStop(0.8, '#ff0055');
    mainGrad.addColorStop(1, '#990044');

    ctx.fillStyle = mainGrad;
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 20;
    ctx.fillText(engText, cx, cy);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.8;
    ctx.strokeText(engText, cx, cy);

    // 3. 下にカタカナで「ギャラクトリス」を添える
    const jpText = 'ギャラクトリス';
    ctx.font = 'bold 22px "DotGothic16", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif';
    ctx.letterSpacing = '4px';

    // カタカナの影
    ctx.fillStyle = '#001122';
    ctx.fillText(jpText, cx + 2, cy + 48);

    // カタカナ本体（ゴールドイエローの鮮明なネオン発光）
    const jpGrad = ctx.createLinearGradient(cx - 100, 0, cx + 100, 0);
    jpGrad.addColorStop(0, '#ffcc00');
    jpGrad.addColorStop(0.5, '#ffffff');
    jpGrad.addColorStop(1, '#ffaa00');

    ctx.fillStyle = jpGrad;
    ctx.shadowColor = '#ffcc00';
    ctx.shadowBlur = 12;
    ctx.fillText(jpText, cx, cy + 46);

    ctx.letterSpacing = '0px';
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

    ctx.restore();
  }
}
