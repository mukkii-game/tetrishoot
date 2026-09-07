import {
  BLOCK_SIZE,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  GRID_COLS,
  GRID_ROWS,
  LEFT_WALL_COL,
  MAX_STAGES,
  PLAYER_FIRE_INTERVAL,
  RIGHT_WALL_COL,
  SHOOTING_TIME_SECONDS,
  TETRIS_TIME_SECONDS,
} from '../config';
import { ParticleManager } from '../effects/Particle';
import { EnemyBullet, PlayerBullet } from '../entities/Bullet';
import { Enemy, EnemyType, MovementPattern } from '../entities/Enemy';
import { Player } from '../entities/Player';
import { TetrominoPiece, TetrominoType } from '../entities/Tetromino';
import { WallManager } from '../entities/Wall';
import { Input } from './Input';
import { Sound } from './Sound';
import { Starfield } from './Starfield';

export type GameState = 'TITLE' | 'PLAYING' | 'STAGE_CLEAR' | 'GAMEOVER' | 'VICTORY';
export type GamePhase = 'TETRIS' | 'SHOOTING';

interface ActiveFallingPiece {
  piece: TetrominoPiece;
  gx: number;
  gy: number;
  fallTimer: number;
}

export class GameManager {
  public state: GameState = 'TITLE';
  public phase: GamePhase = 'TETRIS';
  public stage = 1;
  public score = 0;
  public phaseTimer = TETRIS_TIME_SECONDS;

  public player: Player;
  public wallManager: WallManager;
  public starfield: Starfield;
  public particles: ParticleManager;
  public sound: Sound;

  // テトリスタイム中の操作中ミノ
  public currentFallingPiece: ActiveFallingPiece | null = null;

  // シューティングタイム中のエンティティ
  public playerBullets: PlayerBullet[] = [];
  public enemyBullets: EnemyBullet[] = [];
  public enemies: Enemy[] = [];

  private enemySpawnTimer = 0;
  private stateTimer = 0;
  private transitionAlpha = 0;
  private transitionText = '';

  // キーリピート用タイマー
  private keyRepeatTimer = 0;

  constructor(sound: Sound) {
    this.sound = sound;
    this.player = new Player();
    this.wallManager = new WallManager();
    this.starfield = new Starfield();
    this.particles = new ParticleManager();
  }

  public startNewGame(): void {
    this.stage = 1;
    this.score = 0;
    this.player = new Player();
    this.wallManager = new WallManager();
    this.particles.clear();
    this.currentFallingPiece = null;
    this.playerBullets = [];
    this.enemyBullets = [];
    this.enemies = [];
    this.state = 'PLAYING';
    this.startPhase('TETRIS');
  }

  private startPhase(phase: GamePhase): void {
    this.phase = phase;
    this.phaseTimer = phase === 'TETRIS' ? TETRIS_TIME_SECONDS : SHOOTING_TIME_SECONDS;
    this.currentFallingPiece = null;
    this.enemySpawnTimer = 0.6;

    if (phase === 'TETRIS') {
      this.spawnNextTetromino();
    }

    this.sound.playPhaseAlert(phase === 'TETRIS' ? 'tetris' : 'shooting');
    this.sound.startBGM(phase === 'TETRIS' ? 'tetris' : 'shooting');
    this.showTransitionText(phase === 'TETRIS' ? 'TETRIS TIME!' : 'SHOOTING TIME!');
  }

  private showTransitionText(text: string): void {
    this.transitionText = text;
    this.transitionAlpha = 1.0;
  }

  public update(dt: number, input: Input): void {
    if (input.mutePressed) {
      this.sound.toggleMute();
    }

    this.starfield.update(dt, this.phase === 'SHOOTING' ? 1.8 : 1.0);
    this.particles.update(dt);
    this.wallManager.update(dt);

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
            this.startPhase('TETRIS');
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
    this.phaseTimer -= dt;

    if (this.phase === 'TETRIS') {
      // テトリスタイム：落ちてくるテトリミノをプレイヤーが操作
      this.updateTetrisPhase(dt, input);
    } else {
      // シューティングタイム：自機を上下左右に動かしてエイリアンを迎撃
      this.player.updateMovement(dt, input, this.wallManager);
      this.updateShootingPhase(dt, input);
    }

    if (this.phaseTimer <= 0) {
      if (this.phase === 'TETRIS') {
        this.currentFallingPiece = null;
        this.startPhase('SHOOTING');
      } else {
        this.clearStage();
      }
    }

    if (this.player.isDead) {
      this.triggerGameOver();
    }
  }

  // ==========================================
  // テトリスフェーズ：テトリス操作＆ドッキング
  // ==========================================
  private updateTetrisPhase(dt: number, input: Input): void {
    if (!this.currentFallingPiece) {
      this.spawnNextTetromino();
      return;
    }

    const item = this.currentFallingPiece;

    // 1. 横移動（単押し ＋ 長押しリピート）
    let moveDir = 0;
    if (input.justLeft) moveDir = -1;
    else if (input.justRight) moveDir = 1;
    else if (input.left || input.right) {
      this.keyRepeatTimer += dt;
      if (this.keyRepeatTimer > 0.22) {
        moveDir = input.left ? -1 : 1;
        this.keyRepeatTimer = 0.12;
      }
    } else {
      this.keyRepeatTimer = 0;
    }

    // マウス追従移動
    if (input.hasMouseMoved && input.mouseX !== null) {
      const targetGx = Math.floor(input.mouseX / BLOCK_SIZE) - 1;
      if (targetGx < item.gx && this.canPlace(item.piece, item.gx - 1, item.gy)) {
        item.gx--;
      } else if (targetGx > item.gx && this.canPlace(item.piece, item.gx + 1, item.gy)) {
        item.gx++;
      }
    }

    if (moveDir !== 0) {
      const nextGx = item.gx + moveDir;
      if (this.canPlace(item.piece, nextGx, item.gy)) {
        item.gx = nextGx;
        // 横移動直後に接触チェック（自機または壁にくっついたら即確定！）
        if (this.checkInstantDockOrWall(item)) {
          return;
        }
      }
    }

    // 2. 回転（単押し）
    if (input.justRotate) {
      item.piece.rotate();
      if (!this.canPlace(item.piece, item.gx, item.gy)) {
        // ウォールキック試行（左右1マスずらして入るか）
        if (this.canPlace(item.piece, item.gx - 1, item.gy)) {
          item.gx--;
        } else if (this.canPlace(item.piece, item.gx + 1, item.gy)) {
          item.gx++;
        } else {
          // 回転不可なら元に戻す
          item.piece.rotateCounter();
        }
      }
      // 回転直後に接触チェック
      if (this.checkInstantDockOrWall(item)) {
        return;
      }
    }

    // 3. 自然落下 & 高速ソフトドロップ
    const normalInterval = 0.55;
    const fastInterval = 0.06;
    const dropInterval = (input.down || input.justDrop) ? fastInterval : normalInterval;

    item.fallTimer += dt;
    if (item.fallTimer >= dropInterval) {
      item.fallTimer = 0;
      const nextGy = item.gy + 1;

      // 1マス下に動かせるか？
      if (this.canPlace(item.piece, item.gx, nextGy)) {
        item.gy = nextGy;
        // 落下直後に接触チェック
        if (this.checkInstantDockOrWall(item)) {
          return;
        }
      } else {
        // 下にこれ以上進めない場合（床または直下障害物）
        this.resolvePiecePlacement(item);
      }
    }
  }

  // 指定グリッド位置にミノを重なりなく配置できるか（自機・壁・画面外との重複チェック）
  private canPlace(piece: TetrominoPiece, gx: number, gy: number): boolean {
    const myCells = this.player.getOccupiedCells();

    for (const cell of piece.cells) {
      const testGx = gx + cell.gx;
      const testGy = gy + cell.gy;

      // 画面左右端の壁外側チェック
      if (testGx < LEFT_WALL_COL + 1 || testGx > RIGHT_WALL_COL - 1) {
        return false;
      }
      // 画面下部床チェック
      if (testGy >= GRID_ROWS - 1) {
        return false;
      }
      // 壁ブロックと重複しているか
      if (this.wallManager.hasBlock(testGx, testGy)) {
        return false;
      }
      // 自機セルと重複しているか
      for (const mc of myCells) {
        if (mc.gx === testGx && mc.gy === testGy) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * 「自機または壁にくっついた瞬間に確定」判定
   */
  private checkInstantDockOrWall(item: ActiveFallingPiece): boolean {
    // 1. 自機とのドッキング判定（上または左右から接触）
    const dockResult = this.player.tryDock(item.piece, item.gx, item.gy);
    if (dockResult.docked) {
      this.sound.playDock();
      const px = (item.gx + 1) * BLOCK_SIZE;
      const py = (item.gy + 1) * BLOCK_SIZE;
      this.particles.emitDockRing(px, py, item.piece.color);
      this.score += 300;
      this.currentFallingPiece = null;
      this.spawnNextTetromino();
      return true;
    }

    // 2. 左右の壁ブロックとの接触判定（防壁化）
    let touchWall = false;
    for (const cell of item.piece.cells) {
      const cgx = item.gx + cell.gx;
      const cgy = item.gy + cell.gy;

      // 左壁に隣接
      if (cgx <= LEFT_WALL_COL + 1 || this.wallManager.hasBlock(cgx - 1, cgy)) {
        touchWall = true;
        break;
      }
      // 右壁に隣接
      if (cgx >= RIGHT_WALL_COL - 1 || this.wallManager.hasBlock(cgx + 1, cgy)) {
        touchWall = true;
        break;
      }
    }

    if (touchWall && item.gy >= 2) {
      this.wallManager.attachPiece(item.piece, item.gx, item.gy);
      this.sound.playDock();
      const px = (item.gx + 1) * BLOCK_SIZE;
      const py = (item.gy + 1) * BLOCK_SIZE;
      this.particles.emitDockRing(px, py, '#5588aa');
      this.score += 150;
      this.currentFallingPiece = null;
      this.spawnNextTetromino();
      return true;
    }

    return false;
  }

  // 床等で止まった場合の処理
  private resolvePiecePlacement(item: ActiveFallingPiece): void {
    if (!this.checkInstantDockOrWall(item)) {
      // 自機にも壁にもくっつかずに床に到達した場合は粉砕消滅
      const px = (item.gx + 1) * BLOCK_SIZE;
      const py = (item.gy + 1) * BLOCK_SIZE;
      this.sound.playExplosion(false);
      this.particles.emitExplosion(px, py, item.piece.color, 16);
      this.currentFallingPiece = null;
      this.spawnNextTetromino();
    }
  }

  // 次の落下ミノを上部中央にスポーン
  private spawnNextTetromino(): void {
    const types: TetrominoType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
    const type = types[Math.floor(Math.random() * types.length)];
    const piece = new TetrominoPiece(type);

    const startGx = Math.floor(GRID_COLS / 2) - 1;
    const startGy = 1;

    this.currentFallingPiece = {
      piece,
      gx: startGx,
      gy: startGy,
      fallTimer: 0,
    };
  }

  // ==========================================
  // シューティングフェーズ
  // ==========================================
  private updateShootingPhase(dt: number, input: Input): void {
    // 自機ショットの発射（塞がり判定考慮済み）
    if ((input.shoot || input.isMouseDown) && this.player.fireCooldown <= 0) {
      const newBullets = this.player.shootBullets(this.wallManager);
      if (newBullets.length > 0) {
        this.playerBullets.push(...newBullets);
        this.sound.playShoot();
        this.player.fireCooldown = PLAYER_FIRE_INTERVAL;
      }
    }

    // プレイヤー弾の更新＆壁コリジョン
    for (let i = this.playerBullets.length - 1; i >= 0; i--) {
      const b = this.playerBullets[i];
      b.update(dt);

      if (b.isDead) {
        this.playerBullets.splice(i, 1);
        continue;
      }

      const gx = Math.floor(b.x / BLOCK_SIZE);
      const gy = Math.floor(b.y / BLOCK_SIZE);
      if (this.wallManager.hasBlock(gx, gy)) {
        b.isDead = true;
        this.particles.emitSparks(b.x, b.y, b.color, 4);
        this.playerBullets.splice(i, 1);
      }
    }

    // 敵のスポーン
    this.enemySpawnTimer -= dt;
    if (this.enemySpawnTimer <= 0) {
      this.spawnEnemyGroup();
      this.enemySpawnTimer = Math.max(1.2, 3.2 - this.stage * 0.18);
    }

    // 敵の更新＆敵弾生成
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const spawnedBullets = e.update(dt, this.wallManager, this.player.anchorX, this.player.anchorY);
      if (spawnedBullets.length > 0) {
        this.enemyBullets.push(...spawnedBullets);
      }

      if (e.isDead) {
        this.enemies.splice(i, 1);
      }
    }

    // 敵弾の更新＆コリジョン
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
      const eb = this.enemyBullets[i];
      eb.update(dt);

      if (eb.isDead) {
        this.enemyBullets.splice(i, 1);
        continue;
      }

      // 壁との衝突（敵弾は壁で消える）
      const bgx = Math.floor(eb.x / BLOCK_SIZE);
      const bgy = Math.floor(eb.y / BLOCK_SIZE);
      if (this.wallManager.hasBlock(bgx, bgy)) {
        eb.isDead = true;
        this.particles.emitSparks(eb.x, eb.y, '#ffffff', 4);
        this.wallManager.damageAt(bgx, bgy, 1);
        this.enemyBullets.splice(i, 1);
        continue;
      }

      // 自機パーツへの被弾判定
      const hitRes = this.player.checkHit(eb.x, eb.y, this.particles);
      if (hitRes.hit) {
        eb.isDead = true;
        this.enemyBullets.splice(i, 1);

        if (hitRes.pieceDestroyed) {
          this.sound.playExplosion(true);
        } else {
          this.sound.playHit();
        }
      }
    }

    // プレイヤー弾 vs 敵 の当たり判定
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
          this.particles.emitSparks(pb.x, pb.y, pb.color, 6);

          const killed = enemy.hit(1);
          if (killed) {
            this.sound.playExplosion(enemy.type === 'BOSS');
            this.particles.emitExplosion(
              enemy.x + enemy.width / 2,
              enemy.y + enemy.height / 2,
              '#ffaa00',
              enemy.type === 'BOSS' ? 50 : 20,
              enemy.type === 'BOSS'
            );
            this.score += enemy.scoreValue;
          }
          break;
        }
      }
    }

    // 敵本体 vs 自機の体当たり
    for (const enemy of this.enemies) {
      if (enemy.isDead) continue;
      const hitRes = this.player.checkHit(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, this.particles);
      if (hitRes.hit) {
        enemy.hit(5);
        this.sound.playExplosion(true);
      }
    }
  }

  private spawnEnemyGroup(): void {
    const patterns: MovementPattern[] = ['SINE', 'LOOP_DIVE', 'DIAGONAL', 'STRAIGHT'];
    const chosenPattern = patterns[Math.floor(Math.random() * patterns.length)];

    if (this.stage === 10 && this.enemies.filter(e => e.type === 'BOSS').length === 0) {
      this.enemies.push(new Enemy('BOSS', 'BOSS_PATTERN', CANVAS_WIDTH / 2 - 32, -60, 2.0));
      return;
    }
    if (this.stage === 5 && this.enemies.filter(e => e.type === 'BOSS').length === 0) {
      this.enemies.push(new Enemy('BOSS', 'BOSS_PATTERN', CANVAS_WIDTH / 2 - 32, -60, 1.2));
      return;
    }

    const enemyType: EnemyType = Math.random() > 0.4 ? 'BEE' : 'BUTTERFLY';
    const count = Math.floor(Math.random() * 3) + 2;
    const startX = Math.random() * (CANVAS_WIDTH - 200) + 100;

    for (let k = 0; k < count; k++) {
      const e = new Enemy(
        enemyType,
        chosenPattern,
        startX + (k - (count - 1) / 2) * 36,
        -40 - k * 30,
        1.0 + this.stage * 0.15
      );
      this.enemies.push(e);
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
    this.sound.playGameOver();
    this.state = 'GAMEOVER';
    this.stateTimer = 2.0;
    this.showTransitionText('GAME OVER');
  }

  public draw(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 1. ギャラガ風スターフィールド
    this.starfield.draw(ctx);

    // 2. 左右の壁ブロックおよび防壁ミノ
    this.wallManager.draw(ctx);

    // 3. テトリスタイム中の操作中落下ミノ描画
    if (this.phase === 'TETRIS' && this.currentFallingPiece) {
      const item = this.currentFallingPiece;
      for (const cell of item.piece.cells) {
        const px = (item.gx + cell.gx) * BLOCK_SIZE;
        const py = (item.gy + cell.gy) * BLOCK_SIZE;
        item.piece.drawCell(ctx, px, py);
      }

      // ゴーストミノ（落下予測位置の薄いプレビュー）
      let ghostGy = item.gy;
      while (this.canPlace(item.piece, item.gx, ghostGy + 1)) {
        ghostGy++;
      }
      if (ghostGy > item.gy) {
        ctx.save();
        ctx.globalAlpha = 0.25;
        for (const cell of item.piece.cells) {
          const gpx = (item.gx + cell.gx) * BLOCK_SIZE;
          const gpy = (ghostGy + cell.gy) * BLOCK_SIZE;
          ctx.strokeStyle = item.piece.color;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(gpx + 1, gpy + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
        }
        ctx.restore();
      }
    }

    // 4. 自機（シューティング時は銃口マズルとスラスター炎）
    if (!this.player.isDead) {
      this.player.draw(ctx, this.wallManager);
    }

    // 5. プレイヤー極太弾
    for (const bullet of this.playerBullets) {
      bullet.draw(ctx);
    }

    // 6. 敵機
    for (const enemy of this.enemies) {
      enemy.draw(ctx);
    }

    // 7. 敵弾
    for (const eBullet of this.enemyBullets) {
      eBullet.draw(ctx);
    }

    // 8. パーティクル
    this.particles.draw(ctx);

    // 9. フェーズ切り替えバナー
    if (this.transitionAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.transitionAlpha);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillRect(0, CANVAS_HEIGHT / 2 - 45, CANVAS_WIDTH, 90);

      ctx.font = '900 32px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = this.phase === 'TETRIS' ? '#00ffaa' : '#ff3366';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 15;
      ctx.fillText(this.transitionText, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      ctx.restore();
    }

    // 10. オーバーレイ画面
    this.drawOverlays(ctx);
  }

  private drawOverlays(ctx: CanvasRenderingContext2D): void {
    if (this.state === 'TITLE') {
      ctx.save();
      ctx.fillStyle = 'rgba(5, 7, 10, 0.85)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.textAlign = 'center';
      ctx.font = '900 44px "Segoe UI", sans-serif';
      ctx.fillStyle = '#00f0f0';
      ctx.shadowColor = '#00f0f0';
      ctx.shadowBlur = 20;
      ctx.fillText('テトリシュー', CANVAS_WIDTH / 2, 210);

      ctx.font = '800 18px "Segoe UI", sans-serif';
      ctx.fillStyle = '#ffaa00';
      ctx.shadowColor = '#ffaa00';
      ctx.shadowBlur = 10;
      ctx.fillText('TETRISHOOT - ギャラガ × テトリス', CANVAS_WIDTH / 2, 255);

      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#c9d1d9';
      ctx.shadowBlur = 0;
      const lines = [
        '【テトリスタイム (15秒)】',
        '落ちてくるミノを操作（←/→移動、↑/Space回転、↓高速落下）',
        '自機や左右の壁に接した瞬間に確定ドッキング！',
        '',
        '【シューティングタイム (15秒)】',
        '自機は上下左右に自由に移動可能！',
        'ミノの「入口と出口」から極太弾が発射（隣が塞がれていると不発）',
        '被弾パーツは壊れる！全10面を生き残れ！',
      ];
      lines.forEach((line, idx) => {
        ctx.fillText(line, CANVAS_WIDTH / 2, 310 + idx * 24);
      });

      const blink = Math.sin(Date.now() / 250) > 0;
      if (blink) {
        ctx.font = 'bold 20px sans-serif';
        ctx.fillStyle = '#ffea00';
        ctx.fillText('PRESS SPACE OR CLICK TO START', CANVAS_WIDTH / 2, 540);
      }
      ctx.restore();
    } else if (this.state === 'GAMEOVER') {
      ctx.save();
      ctx.fillStyle = 'rgba(20, 0, 0, 0.8)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.textAlign = 'center';
      ctx.font = '900 44px sans-serif';
      ctx.fillStyle = '#ff2244';
      ctx.shadowColor = '#ff0033';
      ctx.shadowBlur = 20;
      ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, 300);

      ctx.font = 'bold 22px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 0;
      ctx.fillText(`FINAL SCORE: ${this.score}`, CANVAS_WIDTH / 2, 360);
      ctx.fillText(`REACHED STAGE: ${this.stage} / ${MAX_STAGES}`, CANVAS_WIDTH / 2, 400);

      if (this.stateTimer <= 0) {
        ctx.font = '16px sans-serif';
        ctx.fillStyle = '#ffee00';
        ctx.fillText('PRESS SPACE TO RETRY', CANVAS_WIDTH / 2, 480);
      }
      ctx.restore();
    } else if (this.state === 'VICTORY') {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 20, 10, 0.85)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.textAlign = 'center';
      ctx.font = '900 42px sans-serif';
      ctx.fillStyle = '#00ffaa';
      ctx.shadowColor = '#00ffaa';
      ctx.shadowBlur = 25;
      ctx.fillText('ALL STAGES CLEAR!', CANVAS_WIDTH / 2, 280);

      ctx.font = 'bold 24px sans-serif';
      ctx.fillStyle = '#ffee00';
      ctx.fillText(`CONGRATULATIONS!`, CANVAS_WIDTH / 2, 340);
      ctx.fillText(`TOTAL SCORE: ${this.score}`, CANVAS_WIDTH / 2, 390);

      if (this.stateTimer <= 0) {
        ctx.font = '16px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('PRESS SPACE TO PLAY AGAIN', CANVAS_WIDTH / 2, 480);
      }
      ctx.restore();
    }
  }
}
