import {
  BLOCK_SIZE,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  GRID_ROWS,
  LEFT_WALL_COL,
  MAX_STAGES,
  PLAYER_FIRE_INTERVAL,
  RIGHT_WALL_COL,
} from '../config';
import { ParticleManager } from '../effects/Particle';
import { EnemyBullet, PlayerBullet } from '../entities/Bullet';
import { Enemy } from '../entities/Enemy';
import { Player } from '../entities/Player';
import { TetrominoPiece, TetrominoType } from '../entities/Tetromino';
import { WallManager } from '../entities/Wall';
import { Input } from './Input';
import { Sound } from './Sound';
import { Starfield } from './Starfield';

export type GameState = 'TITLE' | 'PLAYING' | 'STAGE_CLEAR' | 'GAMEOVER' | 'VICTORY';
export type GamePhase = 'TETRIS' | 'SHOOTING';

// 落ちてくるミノの状態
export interface FallingPieceItem {
  index: number; // 0, 1, 2
  piece: TetrominoPiece;
  gx: number;
  gy: number;
  fallTimer: number;
  settled: boolean; // 確定（結合、壁、またはスルー消滅）済みか
}

export class GameManager {
  public state: GameState = 'TITLE';
  public phase: GamePhase = 'TETRIS';
  public stage = 1;
  public score = 0;

  public player: Player;
  public wallManager: WallManager;
  public starfield: Starfield;
  public particles: ParticleManager;
  public sound: Sound;

  // テトリスフェーズ：同時に落ちてくる3つのミノ
  public fallingPieces: FallingPieceItem[] = [];
  public activePieceIndex = 0; // 現在プレイヤーが操作中のミノ番号 (0, 1, 2)
  public remainingPiecesCount = 3;

  // シューティングフェーズ：ギャラガ編隊
  public playerBullets: PlayerBullet[] = [];
  public enemyBullets: EnemyBullet[] = [];
  public enemies: Enemy[] = [];
  public formationOffsetAngle = 0;
  public shootingTimeLimit = 20; // 最大20秒、または敵全滅でクリア

  private stateTimer = 0;
  private transitionAlpha = 0;
  private transitionText = '';
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
    this.state = 'PLAYING';
    this.startTetrisPhase();
  }

  // ==========================================
  // フェーズ移行
  // ==========================================
  private startTetrisPhase(): void {
    this.phase = 'TETRIS';
    this.playerBullets = [];
    this.enemyBullets = [];
    this.enemies = [];

    // 1度に3つのミノをスポーン！
    this.spawnThreeTetrominoes();
    this.remainingPiecesCount = 3;

    this.sound.playPhaseAlert('tetris');
    this.sound.startBGM('tetris');
    this.showTransitionText(`STAGE ${this.stage}: TETRIS TIME (3 PIECES)`);
  }

  private startShootingPhase(): void {
    this.phase = 'SHOOTING';
    this.fallingPieces = [];
    this.shootingTimeLimit = 22; // 最大22秒
    this.formationOffsetAngle = 0;

    // ギャラガ風エイリアン編隊のスポーン
    this.spawnGalagaFormation();

    this.sound.playPhaseAlert('shooting');
    this.sound.startBGM('shooting');
    this.showTransitionText('GALAGA BATTLE START!');
  }

  private showTransitionText(text: string): void {
    this.transitionText = text;
    this.transitionAlpha = 1.0;
  }

  public update(dt: number, input: Input): void {
    if (input.mutePressed) {
      this.sound.toggleMute();
    }

    this.starfield.update(dt, this.phase === 'SHOOTING' ? 2.0 : 1.0);
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
      this.player.updateMovement(dt, input, this.wallManager);
      this.updateShootingPhase(dt, input);
    }

    if (this.player.isDead) {
      this.triggerGameOver();
    }
  }

  // ==========================================
  // テトリスフェーズ：3つ同時に落下、スルー可、落とし終わったらバトル
  // ==========================================
  private spawnThreeTetrominoes(): void {
    const types: TetrominoType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
    this.fallingPieces = [];

    // 3つの初期位置（左・中・右）
    const initialCols = [3, 8, 13];

    for (let i = 0; i < 3; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      const piece = new TetrominoPiece(type);

      // ランダムで初期回転
      const r = Math.floor(Math.random() * 4);
      for (let k = 0; k < r; k++) piece.rotate();

      this.fallingPieces.push({
        index: i,
        piece,
        gx: initialCols[i],
        gy: 1 - i * 2, // わずかに段差をつけて見やすく配置
        fallTimer: 0,
        settled: false,
      });
    }

    this.activePieceIndex = 0;
  }

  private updateTetrisPhase(dt: number, input: Input): void {
    // 操作ミノの切り替え（[1][2][3] または Tabキー）
    if (input.selectedPieceIndex !== null) {
      if (this.fallingPieces[input.selectedPieceIndex] && !this.fallingPieces[input.selectedPieceIndex].settled) {
        this.activePieceIndex = input.selectedPieceIndex;
      }
    } else if (input.justTab) {
      this.cycleActivePiece();
    }

    // マウスクリックでのミノ選択
    if (input.hasMouseMoved && input.isMouseDown && input.mouseX !== null && input.mouseY !== null) {
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

    // 現在のアクティブミノが確定済みなら、まだ確定していないミノへ自動フォーカス
    const activeItem = this.fallingPieces[this.activePieceIndex];
    if (!activeItem || activeItem.settled) {
      this.cycleActivePiece();
    }

    const currentItem = this.fallingPieces[this.activePieceIndex];

    // アクティブなミノに対するキーボード操作
    if (currentItem && !currentItem.settled) {
      // 左右移動
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
          this.checkInstantDockOrWall(currentItem);
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
        this.checkInstantDockOrWall(currentItem);
      }
    }

    // 3つのミノそれぞれの自然落下＆高速ソフトドロップ
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
          this.checkInstantDockOrWall(item);
        } else {
          // 下に行けない（床または自機/壁直上）
          this.resolvePiecePlacement(item);
        }
      }
    }

    // 残りの未確定ミノ数をカウント
    const remaining = this.fallingPieces.filter(p => !p.settled).length;
    this.remainingPiecesCount = remaining;

    // 「3つ落とし終わったら、バトルへ」！
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

  // 重なり判定（自機・壁・画面端・他の落下中ミノとの衝突）
  private canPlace(piece: TetrominoPiece, gx: number, gy: number, selfItem: FallingPieceItem): boolean {
    const myCells = this.player.getOccupiedCells();

    for (const cell of piece.cells) {
      const testGx = gx + cell.gx;
      const testGy = gy + cell.gy;

      if (testGx < LEFT_WALL_COL + 1 || testGx > RIGHT_WALL_COL - 1) return false;
      if (testGy >= GRID_ROWS - 1) return false;
      if (this.wallManager.hasBlock(testGx, testGy)) return false;

      for (const mc of myCells) {
        if (mc.gx === testGx && mc.gy === testGy) return false;
      }

      // 他の落下中ミノのセルとも重ならないか
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

  // 接触即確定（自機ドッキング or 壁防壁化）
  private checkInstantDockOrWall(item: FallingPieceItem): boolean {
    if (item.settled) return false;

    // 1. 自機とのドッキング
    const dockResult = this.player.tryDock(item.piece, item.gx, item.gy);
    if (dockResult.docked) {
      item.settled = true;
      this.sound.playDock();
      const px = (item.gx + 1) * BLOCK_SIZE;
      const py = (item.gy + 1) * BLOCK_SIZE;
      this.particles.emitDockRing(px, py, item.piece.color);
      this.score += 300;
      this.cycleActivePiece();
      return true;
    }

    // 2. 左右の壁ブロックとの接触判定（防壁化）
    let touchWall = false;
    for (const cell of item.piece.cells) {
      const cgx = item.gx + cell.gx;
      const cgy = item.gy + cell.gy;

      if (cgx <= LEFT_WALL_COL + 1 || this.wallManager.hasBlock(cgx - 1, cgy)) {
        touchWall = true;
        break;
      }
      if (cgx >= RIGHT_WALL_COL - 1 || this.wallManager.hasBlock(cgx + 1, cgy)) {
        touchWall = true;
        break;
      }
    }

    if (touchWall && item.gy >= 2) {
      item.settled = true;
      this.wallManager.attachPiece(item.piece, item.gx, item.gy);
      this.sound.playDock();
      const px = (item.gx + 1) * BLOCK_SIZE;
      const py = (item.gy + 1) * BLOCK_SIZE;
      this.particles.emitDockRing(px, py, '#5588aa');
      this.score += 150;
      this.cycleActivePiece();
      return true;
    }

    return false;
  }

  // 床に落ちた場合（スルー消滅）
  private resolvePiecePlacement(item: FallingPieceItem): void {
    if (!this.checkInstantDockOrWall(item)) {
      // スルー：床に激突して粉砕消滅
      item.settled = true;
      const px = (item.gx + 1) * BLOCK_SIZE;
      const py = (item.gy + 1) * BLOCK_SIZE;
      this.sound.playExplosion(false);
      this.particles.emitExplosion(px, py, item.piece.color, 14);
      this.cycleActivePiece();
    }
  }

  // ==========================================
  // ギャラガ風シューティングフェーズ
  // ==========================================
  private spawnGalagaFormation(): void {
    this.enemies = [];

    // 10面はボスUFO艦隊
    if (this.stage === 10) {
      this.enemies.push(new Enemy('UFO_BOSS', 4, 0, 0.2));
      for (let col = 2; col <= 7; col++) {
        this.enemies.push(new Enemy('YELLOW_FLAGSHIP', col, 1, 0.4 + col * 0.1));
      }
      for (let col = 1; col <= 8; col++) {
        this.enemies.push(new Enemy('RED_GUARD', col, 2, 0.8 + col * 0.08));
      }
      return;
    }

    // 5面は中ボスUFO
    if (this.stage === 5) {
      this.enemies.push(new Enemy('UFO_BOSS', 4, 0, 0.2));
    } else {
      // イエロー司令官（最上段）
      this.enemies.push(new Enemy('YELLOW_FLAGSHIP', 4, 0, 0.2));
      this.enemies.push(new Enemy('YELLOW_FLAGSHIP', 5, 0, 0.3));
    }

    // レッドガード蝶（2段目）
    const redCount = Math.min(6, 2 + this.stage);
    for (let c = 0; c < redCount; c++) {
      const col = 2 + c;
      this.enemies.push(new Enemy('RED_GUARD', col, 1, 0.5 + c * 0.12));
    }

    // グリーンドローン（3段目・4段目）
    const greenCount = Math.min(8, 3 + this.stage);
    for (let c = 0; c < greenCount; c++) {
      const col = 1 + c;
      this.enemies.push(new Enemy('GREEN_DRONE', col, 2, 0.9 + c * 0.1));
    }
  }

  private updateShootingPhase(dt: number, input: Input): void {
    this.shootingTimeLimit -= dt;
    this.formationOffsetAngle += dt * 2.2;

    // 自機ショット
    if ((input.shoot || input.isMouseDown) && this.player.fireCooldown <= 0) {
      const newBullets = this.player.shootBullets(this.wallManager);
      if (newBullets.length > 0) {
        this.playerBullets.push(...newBullets);
        this.sound.playShoot();
        this.player.fireCooldown = PLAYER_FIRE_INTERVAL;
      }
    }

    // プレイヤー弾
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

    // ギャラガ敵の更新（現在ダイブ中の機体数を制御）
    const divingCount = this.enemies.filter(e => e.state === 'DIVING').length;
    const maxDiving = Math.min(4, 1 + Math.floor(this.stage / 2));
    const canDive = divingCount < maxDiving;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const spawned = e.update(
        dt,
        this.formationOffsetAngle,
        this.wallManager,
        this.player.anchorX,
        this.player.anchorY,
        canDive
      );
      if (spawned.length > 0) {
        this.enemyBullets.push(...spawned);
      }
      if (e.isDead) {
        this.enemies.splice(i, 1);
      }
    }

    // 敵弾
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
      const eb = this.enemyBullets[i];
      eb.update(dt);
      if (eb.isDead) {
        this.enemyBullets.splice(i, 1);
        continue;
      }

      const bgx = Math.floor(eb.x / BLOCK_SIZE);
      const bgy = Math.floor(eb.y / BLOCK_SIZE);
      if (this.wallManager.hasBlock(bgx, bgy)) {
        eb.isDead = true;
        this.particles.emitSparks(eb.x, eb.y, '#ffffff', 4);
        this.wallManager.damageAt(bgx, bgy, 1);
        this.enemyBullets.splice(i, 1);
        continue;
      }

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
          this.particles.emitSparks(pb.x, pb.y, pb.color, 6);

          const killed = enemy.hit(1);
          if (killed) {
            const isBoss = enemy.rank === 'UFO_BOSS' || enemy.rank === 'YELLOW_FLAGSHIP';
            this.sound.playExplosion(isBoss);
            this.particles.emitExplosion(
              enemy.x + enemy.width / 2,
              enemy.y + enemy.height / 2,
              '#ffaa00',
              isBoss ? 45 : 18,
              isBoss
            );
            this.score += enemy.scoreValue;
          }
          break;
        }
      }
    }

    // 敵本体 vs 自機 体当たり
    for (const enemy of this.enemies) {
      if (enemy.isDead) continue;
      const hitRes = this.player.checkHit(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, this.particles);
      if (hitRes.hit) {
        enemy.hit(5);
        this.sound.playExplosion(true);
      }
    }

    // クリア判定：敵全滅、または時間切れ生存
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
    this.sound.playGameOver();
    this.state = 'GAMEOVER';
    this.stateTimer = 2.0;
    this.showTransitionText('GAME OVER');
  }

  // ==========================================
  // 描画
  // ==========================================
  public draw(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 1. ギャラガ風スターフィールド
    this.starfield.draw(ctx);

    // 2. 左右の壁ブロックおよび防壁ミノ
    this.wallManager.draw(ctx);

    // 3. テトリスフェーズ：3つの落下中ミノ
    if (this.phase === 'TETRIS') {
      for (const item of this.fallingPieces) {
        if (item.settled) continue;

        const isActive = item.index === this.activePieceIndex;

        // ミノ描画
        for (const cell of item.piece.cells) {
          const px = (item.gx + cell.gx) * BLOCK_SIZE;
          const py = (item.gy + cell.gy) * BLOCK_SIZE;
          item.piece.drawCell(ctx, px, py);
        }

        // アクティブなミノには強調枠と番号バッジ [1][2][3] を表示
        if (isActive) {
          ctx.save();
          // ゴーストミノ（落下予測位置）
          let ghostGy = item.gy;
          while (this.canPlace(item.piece, item.gx, ghostGy + 1, item)) {
            ghostGy++;
          }
          if (ghostGy > item.gy) {
            ctx.globalAlpha = 0.3;
            for (const cell of item.piece.cells) {
              const gpx = (item.gx + cell.gx) * BLOCK_SIZE;
              const gpy = (ghostGy + cell.gy) * BLOCK_SIZE;
              ctx.strokeStyle = item.piece.color;
              ctx.lineWidth = 1.5;
              ctx.strokeRect(gpx + 1, gpy + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
            }
          }

          // 番号バッジ
          ctx.globalAlpha = 1.0;
          ctx.fillStyle = '#00ffff';
          ctx.font = 'bold 12px monospace';
          ctx.fillText(`[${item.index + 1}]`, item.gx * BLOCK_SIZE, item.gy * BLOCK_SIZE - 4);
          ctx.restore();
        } else {
          // 非アクティブミノの番号
          ctx.save();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.font = '11px monospace';
          ctx.fillText(`[${item.index + 1}]`, item.gx * BLOCK_SIZE, item.gy * BLOCK_SIZE - 4);
          ctx.restore();
        }
      }
    }

    // 4. 自機
    if (!this.player.isDead) {
      this.player.draw(ctx, this.wallManager);
    }

    // 5. プレイヤー極太弾
    for (const bullet of this.playerBullets) {
      bullet.draw(ctx);
    }

    // 6. ギャラガ原色エイリアン
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
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
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

    // 10. タイトル・ゲームオーバーオーバーレイ
    this.drawOverlays(ctx);
  }

  private drawOverlays(ctx: CanvasRenderingContext2D): void {
    if (this.state === 'TITLE') {
      ctx.save();
      ctx.fillStyle = 'rgba(2, 4, 8, 0.9)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.textAlign = 'center';
      ctx.font = '900 42px monospace';
      ctx.fillStyle = '#00f0ff';
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 20;
      ctx.fillText('TETRISHOOT', CANVAS_WIDTH / 2, 190);

      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = '#ffea00';
      ctx.shadowColor = '#ffea00';
      ctx.shadowBlur = 8;
      ctx.fillText('ギャラガ × テトリス (CRT EDITION)', CANVAS_WIDTH / 2, 230);

      ctx.font = '13px monospace';
      ctx.fillStyle = '#c9d1d9';
      ctx.shadowBlur = 0;
      const lines = [
        '【テトリスタイム】',
        '一度に3つのテトリミノが降下！',
        '[1][2][3] や Tab で操作ミノを選択',
        '自機や左右の壁に触れた瞬間に確定ドッキング！',
        'スルーして床に落としてもOK。3つ落とし終わるとバトルへ！',
        '',
        '【ギャラガバトル】',
        '自機は上下左右（WASD / 矢印 / マウス）に全方向移動！',
        'ミノの「入口と出口」から極太ビーム斉射（塞がれると不発）',
        '宙返りダイブするエイリアンを撃破せよ！',
      ];
      lines.forEach((line, idx) => {
        ctx.fillText(line, CANVAS_WIDTH / 2, 280 + idx * 22);
      });

      const blink = Math.sin(Date.now() / 250) > 0;
      if (blink) {
        ctx.font = 'bold 18px monospace';
        ctx.fillStyle = '#00ffaa';
        ctx.fillText('PRESS SPACE OR CLICK TO START', CANVAS_WIDTH / 2, 530);
      }
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
}
