import {
  BLOCK_SIZE,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  LEFT_WALL_COL,
  MAX_STAGES,
  PLAYER_FIRE_INTERVAL,
  RIGHT_WALL_COL,
  SHOOTING_TIME_SECONDS,
  TETRIS_TIME_SECONDS,
  TETROMINO_FALL_SPEED,
  TETROMINO_SPAWN_INTERVAL,
} from '../config';
import { ParticleManager } from '../effects/Particle';
import { EnemyBullet, PlayerBullet } from '../entities/Bullet';
import { Enemy, EnemyType, MovementPattern } from '../entities/Enemy';
import { Player } from '../entities/Player';
import { TetrominoPiece, TetrominoType } from '../entities/Tetromino';
import { WallManager } from './../entities/Wall';
import { Input } from './Input';
import { Sound } from './Sound';
import { Starfield } from './Starfield';

export type GameState = 'TITLE' | 'PLAYING' | 'STAGE_CLEAR' | 'GAMEOVER' | 'VICTORY';
export type GamePhase = 'TETRIS' | 'SHOOTING';

interface FallingTetromino {
  piece: TetrominoPiece;
  px: number;
  py: number;
  vy: number;
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

  // ゲーム中エンティティ
  public fallingTetrominoes: FallingTetromino[] = [];
  public playerBullets: PlayerBullet[] = [];
  public enemyBullets: EnemyBullet[] = [];
  public enemies: Enemy[] = [];

  private spawnTimer = 0;
  private enemySpawnTimer = 0;
  private stateTimer = 0;
  private transitionAlpha = 0;
  private transitionText = '';

  constructor(sound: Sound) {
    this.sound = sound;
    this.player = new Player();
    this.wallManager = new WallManager();
    this.starfield = new Starfield();
    this.particles = new ParticleManager();
  }

  // ゲームの開始 / リスタート
  public startNewGame(): void {
    this.stage = 1;
    this.score = 0;
    this.player = new Player();
    this.wallManager = new WallManager();
    this.particles.clear();
    this.fallingTetrominoes = [];
    this.playerBullets = [];
    this.enemyBullets = [];
    this.enemies = [];
    this.state = 'PLAYING';
    this.startPhase('TETRIS');
  }

  // フェーズ切り替え（テトリス ⇄ シューティング）
  private startPhase(phase: GamePhase): void {
    this.phase = phase;
    this.phaseTimer = phase === 'TETRIS' ? TETRIS_TIME_SECONDS : SHOOTING_TIME_SECONDS;
    this.spawnTimer = 0.5; // すぐに最初のミノが落ちる
    this.enemySpawnTimer = 0.5;
    this.fallingTetrominoes = [];

    this.sound.playPhaseAlert(phase === 'TETRIS' ? 'tetris' : 'shooting');
    this.sound.startBGM(phase === 'TETRIS' ? 'tetris' : 'shooting');

    this.showTransitionText(phase === 'TETRIS' ? 'TETRIS TIME!' : 'SHOOTING TIME!');
  }

  private showTransitionText(text: string): void {
    this.transitionText = text;
    this.transitionAlpha = 1.0;
  }

  public update(dt: number, input: Input): void {
    // ミュート切り替え
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
    // 自機の移動
    this.player.updateMovement(dt, input, this.wallManager);

    // フェーズタイマー減少
    this.phaseTimer -= dt;

    if (this.phase === 'TETRIS') {
      this.updateTetrisPhase(dt);
    } else {
      this.updateShootingPhase(dt, input);
    }

    // フェーズ時間終了の判定
    if (this.phaseTimer <= 0) {
      if (this.phase === 'TETRIS') {
        // テトリスタイム終了 → シューティングタイム開始
        this.startPhase('SHOOTING');
      } else {
        // シューティングタイム終了 → 1面クリア！
        this.clearStage();
      }
    }

    // ゲームオーバー判定（自機全パーツ壊滅）
    if (this.player.isDead) {
      this.triggerGameOver();
    }
  }

  // テトリスフェーズの更新
  private updateTetrisPhase(dt: number): void {
    // ミノの定期スポーン
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnFallingTetromino();
      this.spawnTimer = TETROMINO_SPAWN_INTERVAL;
    }

    // 落下ミノの移動・結合・壁コリジョン
    for (let i = this.fallingTetrominoes.length - 1; i >= 0; i--) {
      const item = this.fallingTetrominoes[i];
      item.py += item.vy * dt;

      // 1. 自機とのドッキング判定
      const dockResult = this.player.tryDock(item.piece, item.px, item.py);
      if (dockResult.docked) {
        this.sound.playDock();
        this.particles.emitDockRing(item.px + BLOCK_SIZE, item.py + BLOCK_SIZE, item.piece.color);
        this.score += 300;
        this.fallingTetrominoes.splice(i, 1);
        continue;
      }

      // 2. 左右の壁ブロックとの接触判定（防壁化）
      const fallGx = Math.round(item.px / BLOCK_SIZE);
      const fallGy = Math.round(item.py / BLOCK_SIZE);
      let touchWall = false;

      for (const cell of item.piece.cells) {
        const cgx = fallGx + cell.gx;
        const cgy = fallGy + cell.gy;
        // 左壁に接したか？
        if (cgx <= LEFT_WALL_COL + 1 || this.wallManager.hasBlock(cgx - 1, cgy)) {
          touchWall = true;
          break;
        }
        // 右壁に接したか？
        if (cgx >= RIGHT_WALL_COL - 1 || this.wallManager.hasBlock(cgx + 1, cgy)) {
          touchWall = true;
          break;
        }
      }

      if (touchWall && item.py > 60) {
        // 壁にくっつけて防壁化！
        this.wallManager.attachPiece(item.piece, fallGx, fallGy);
        this.sound.playDock();
        this.particles.emitDockRing(item.px + BLOCK_SIZE, item.py + BLOCK_SIZE, '#5588aa');
        this.score += 150;
        this.fallingTetrominoes.splice(i, 1);
        continue;
      }

      // 3. 床（画面最下部）に落下した場合
      if (item.py >= CANVAS_HEIGHT - BLOCK_SIZE * 2) {
        // 地面に落ちたミノは崩壊消滅
        this.sound.playExplosion(false);
        this.particles.emitExplosion(item.px + BLOCK_SIZE, item.py + BLOCK_SIZE, item.piece.color, 15);
        this.fallingTetrominoes.splice(i, 1);
      }
    }
  }

  // 落下テトリミノの生成
  private spawnFallingTetromino(): void {
    const types: TetrominoType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
    const type = types[Math.floor(Math.random() * types.length)];
    const piece = new TetrominoPiece(type);

    // ランダムで回転
    const rotations = Math.floor(Math.random() * 4);
    for (let r = 0; r < rotations; r++) {
      piece.rotate();
    }

    // 左右の壁の内側のランダムなグリッド位置から落下
    const minCol = LEFT_WALL_COL + 2;
    const maxCol = RIGHT_WALL_COL - 4;
    const spawnCol = Math.floor(Math.random() * (maxCol - minCol + 1)) + minCol;
    const spawnPx = spawnCol * BLOCK_SIZE;

    this.fallingTetrominoes.push({
      piece,
      px: spawnPx,
      py: -BLOCK_SIZE * 3,
      vy: TETROMINO_FALL_SPEED,
    });
  }

  // シューティングフェーズの更新
  private updateShootingPhase(dt: number, input: Input): void {
    // 自機ショットの発射
    if ((input.shoot || input.isMouseDown) && this.player.fireCooldown <= 0) {
      const newBullets = this.player.shootBullets();
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

      // 壁との衝突（自機弾も壁で消える）
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

      // 自機パーツとの当たり判定（仕様：当たった場所のテトリミノにダメージ、一定ダメージで破壊）
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

        // AABB判定
        if (
          pb.x + pb.width / 2 >= enemy.x &&
          pb.x - pb.width / 2 <= enemy.x + enemy.width &&
          pb.y >= enemy.y &&
          pb.y - pb.height <= enemy.y + enemy.height
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

    // 敵本体 vs 自機 の体当たり判定
    for (const enemy of this.enemies) {
      if (enemy.isDead) continue;
      const hitRes = this.player.checkHit(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, this.particles);
      if (hitRes.hit) {
        enemy.hit(5);
        this.sound.playExplosion(true);
      }
    }
  }

  // 敵編隊の出現ロジック（ギャラガ風編隊）
  private spawnEnemyGroup(): void {
    const patterns: MovementPattern[] = ['SINE', 'LOOP_DIVE', 'DIAGONAL', 'STRAIGHT'];
    const chosenPattern = patterns[Math.floor(Math.random() * patterns.length)];

    // 10面、または5面の中ボス
    if (this.stage === 10 && this.enemies.filter(e => e.type === 'BOSS').length === 0) {
      this.enemies.push(new Enemy('BOSS', 'BOSS_PATTERN', CANVAS_WIDTH / 2 - 32, -60, 2.0));
      return;
    }
    if (this.stage === 5 && this.enemies.filter(e => e.type === 'BOSS').length === 0) {
      this.enemies.push(new Enemy('BOSS', 'BOSS_PATTERN', CANVAS_WIDTH / 2 - 32, -60, 1.2));
      return;
    }

    const enemyType: EnemyType = Math.random() > 0.4 ? 'BEE' : 'BUTTERFLY';
    const count = Math.floor(Math.random() * 3) + 2; // 2〜4機の編隊
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

  // ステージクリア処理
  private clearStage(): void {
    this.sound.stopBGM();
    this.sound.playVictory();
    this.state = 'STAGE_CLEAR';
    this.stateTimer = 2.5;
    this.score += 1000 * this.stage;
    this.showTransitionText(`STAGE ${this.stage} CLEAR!`);
  }

  // ゲームオーバー処理
  private triggerGameOver(): void {
    this.sound.stopBGM();
    this.sound.playGameOver();
    this.state = 'GAMEOVER';
    this.stateTimer = 2.0;
    this.showTransitionText('GAME OVER');
  }

  // レンダリング統合
  public draw(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 1. ギャラガ風スターフィールド
    this.starfield.draw(ctx);

    // 2. 左右の壁ブロックおよび防壁ミノ
    this.wallManager.draw(ctx);

    // 3. テトリスタイム中の落下ミノ描画
    for (const item of this.fallingTetrominoes) {
      for (const cell of item.piece.cells) {
        item.piece.drawCell(ctx, item.px + cell.gx * BLOCK_SIZE, item.py + cell.gy * BLOCK_SIZE);
      }
    }

    // 4. 自機（結合テトリミノ＋スラスター）
    if (!this.player.isDead) {
      this.player.draw(ctx);
    }

    // 5. プレイヤー極太弾
    for (const bullet of this.playerBullets) {
      bullet.draw(ctx);
    }

    // 6. 敵機（ギャラガ風レトロエイリアン）
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

    // 10. ゲーム状態ごとのオーバーレイ画面（タイトル、クリア、ゲームオーバー）
    this.drawOverlays(ctx);
  }

  private drawOverlays(ctx: CanvasRenderingContext2D): void {
    if (this.state === 'TITLE') {
      ctx.save();
      ctx.fillStyle = 'rgba(5, 7, 10, 0.85)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.textAlign = 'center';
      // タイトルロゴ
      ctx.font = '900 44px "Segoe UI", sans-serif';
      ctx.fillStyle = '#00f0f0';
      ctx.shadowColor = '#00f0f0';
      ctx.shadowBlur = 20;
      ctx.fillText('テトリシュー', CANVAS_WIDTH / 2, 220);

      ctx.font = '800 20px "Segoe UI", sans-serif';
      ctx.fillStyle = '#ffaa00';
      ctx.shadowColor = '#ffaa00';
      ctx.shadowBlur = 10;
      ctx.fillText('TETRISHOOT - ギャラガ × テトリス', CANVAS_WIDTH / 2, 265);

      // ルール解説
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#c9d1d9';
      ctx.shadowBlur = 0;
      const lines = [
        '【テトリスタイム (15秒)】',
        '落ちてくるミノに触れて自機を巨大化！',
        '壁にくっつければ強力な防壁になる！',
        '',
        '【シューティングタイム (15秒)】',
        'ミノから極太弾が発射（Tミノは3門、Oミノは0門）',
        '被弾したパーツは壊れる！全10面を生き残れ！',
      ];
      lines.forEach((line, idx) => {
        ctx.fillText(line, CANVAS_WIDTH / 2, 330 + idx * 24);
      });

      // スタートプロンプト
      const blink = Math.sin(Date.now() / 250) > 0;
      if (blink) {
        ctx.font = 'bold 20px sans-serif';
        ctx.fillStyle = '#ffea00';
        ctx.fillText('PRESS SPACE OR CLICK TO START', CANVAS_WIDTH / 2, 550);
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
