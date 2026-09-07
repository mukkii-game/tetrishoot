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

    // ギャラガ＆ムーンクレスタ風 多彩な大編隊をスポーン！
    this.spawnAlienFleet();

    this.sound.playPhaseAlert('shooting');
    this.sound.startBGM('shooting');
    this.showTransitionText('BATTLE START!');
  }

  private showTransitionText(text: string): void {
    this.transitionText = text;
    this.transitionAlpha = 1.0;
  }

  public update(dt: number, input: Input): void {
    if (input.mutePressed) {
      this.sound.toggleMute();
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
  // シューティングフェーズ：ギャプラス風 曲線で連なる美しい大編隊！
  // ==========================================
  private spawnAlienFleet(): void {
    this.enemies = [];

    // ★ ギャプラス＆ギャラガ名物：長く美しい曲線大連隊！
    // 1. S字蛇行ストリーム（左から8機が連なって流れる！）
    for (let k = 0; k < 8; k++) {
      this.enemies.push(
        new Enemy('GREEN_DRONE', 'STREAM_CURVE', 1 + (k % 4), 2, 0.2, 'S_CURVE_LEFT_TO_RIGHT', k)
      );
    }

    // 2. S字蛇行ストリーム（右から8機が連なって流れる！）
    for (let k = 0; k < 8; k++) {
      this.enemies.push(
        new Enemy('RED_GUARD', 'STREAM_CURVE', 5 + (k % 4), 2, 0.6, 'S_CURVE_RIGHT_TO_LEFT', k)
      );
    }

    // 3. ギャラガ名物・8の字ループ大連隊（8機が美しい∞を描いて流れる！）
    for (let k = 0; k < 8; k++) {
      this.enemies.push(
        new Enemy('YELLOW_COMMANDER', 'STREAM_CURVE', 2 + (k % 6), 1, 1.2, 'FIGURE_EIGHT', k)
      );
    }

    // 4. 左右交差ダブルインフィニティ急降下連隊（ステージ2以降）
    if (this.stage >= 2) {
      for (let k = 0; k < 6; k++) {
        this.enemies.push(
          new Enemy('GREEN_DRONE', 'STREAM_CURVE', 1 + k, 3, 1.8, 'INFINITY_DIVE_LEFT', k)
        );
        this.enemies.push(
          new Enemy('RED_GUARD', 'STREAM_CURVE', 4 + k, 3, 1.8, 'INFINITY_DIVE_RIGHT', k)
        );
      }
    }

    // 5. 大型艦＆ボス
    if (this.stage === 10) {
      // ラスボス超大型UFO母船
      this.enemies.push(new Enemy('UFO_MOTHERSHIP', 'CAROUSEL_CIRCLE', 4, 0, 0.2));
      this.enemies.push(new Enemy('GIANT_YELLOW', 'SWEEP_FROM_LEFT', 2, 1, 0.5));
      this.enemies.push(new Enemy('GIANT_YELLOW', 'SWEEP_FROM_RIGHT', 7, 1, 0.5));
    } else if (this.stage === 5) {
      // 5面中ボス超大型UFO
      this.enemies.push(new Enemy('UFO_MOTHERSHIP', 'FORMATION_LOOP', 4, 0, 0.2));
      this.enemies.push(new Enemy('GIANT_RED', 'SWEEP_FROM_LEFT', 2, 1, 0.6));
    } else {
      // 倍サイズ大型旗艦
      this.enemies.push(new Enemy('GIANT_YELLOW', 'FORMATION_LOOP', 4, 0, 0.2));
      if (this.stage >= 3) {
        this.enemies.push(new Enemy('GIANT_RED', 'FORMATION_LOOP', 5, 0, 0.3));
      }
    }

    // 6. 画面下からの急上昇サプライズ編隊！（ステージ3以降）
    if (this.stage >= 3) {
      for (let i = 0; i < 3; i++) {
        this.enemies.push(new Enemy('GREEN_DRONE', 'SURPRISE_FROM_BOTTOM', 3 + i * 2, 2, 2.5 + i * 0.2));
      }
    }
  }

  private updateShootingPhase(dt: number, input: Input): void {
    this.shootingTimeLimit -= dt;
    this.formationOffsetAngle += dt * 2.4;

    // 自機ショット（ムーンクレスタ風ピシューン！）
    if ((input.shoot || input.isMouseDown) && this.player.fireCooldown <= 0) {
      const newBullets = this.player.shootBullets();
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

      // ★ ムーンクレスタ完全再現：「レバーとボタンで　ドッキングせよ」をシアン色ピクセルで描画！
      const blink = Math.sin(Date.now() / 200) > -0.7;
      if (blink) {
        drawMoonCrestaText(ctx, 'レバーとボタンで　ドッキングせよ', CANVAS_WIDTH / 2, 115, 2, '#00f0ff');
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

      // 1. かっこいいメインロゴ
      this.drawCoolTitleLogo(ctx, CANVAS_WIDTH / 2, 175);

      // 2. 超シンプルで分かりやすい説明文
      ctx.textAlign = 'center';
      ctx.font = 'bold 15px "Courier New", monospace';
      ctx.fillStyle = '#00ffcc';
      ctx.shadowColor = '#00ffcc';
      ctx.shadowBlur = 8;
      ctx.fillText('〜 パズルタイムとシューティングタイムが交互に到来 〜', CANVAS_WIDTH / 2, 280);

      ctx.font = '13px "Segoe UI", sans-serif';
      ctx.fillStyle = '#c9d1d9';
      ctx.shadowBlur = 0;
      const lines = [
        '【パズルタイム】',
        '落ちてくるブロックを自機に合体！ 3つ落とし終わるとバトル突入！',
        '',
        '【シューティングタイム】',
        '合体したブロックの先端から極太ビーム斉射！',
        '全方位（上下左右）から襲来する大編隊エイリアンを撃破せよ！',
      ];
      lines.forEach((line, idx) => {
        if (line.startsWith('【')) {
          ctx.fillStyle = line.includes('パズル') ? '#00ffaa' : '#ff3366';
          ctx.font = 'bold 14px "Segoe UI", sans-serif';
        } else {
          ctx.fillStyle = '#d0d7de';
          ctx.font = '13px "Segoe UI", sans-serif';
        }
        ctx.fillText(line, CANVAS_WIDTH / 2, 325 + idx * 24);
      });

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

  // かっこいいタイトルロゴ描画
  private drawCoolTitleLogo(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.save();
    ctx.textAlign = 'center';

    // 英語サブロゴ
    ctx.font = '900 20px "Impact", "Arial Black", sans-serif';
    const subGrad = ctx.createLinearGradient(cx - 140, 0, cx + 140, 0);
    subGrad.addColorStop(0, '#ffcc00');
    subGrad.addColorStop(0.5, '#ffffff');
    subGrad.addColorStop(1, '#ff8800');
    ctx.fillStyle = subGrad;
    ctx.shadowColor = '#ffaa00';
    ctx.shadowBlur = 10;
    ctx.fillText('⚡ T E T R I S H O O T ⚡', cx, cy - 44);

    // 日本語メインロゴ
    const jpText = 'テトリシュー';
    ctx.font = '900 56px "Hiragino Kaku Gothic ProN", "Meiryo", "Arial Black", sans-serif';

    ctx.fillStyle = '#100030';
    ctx.fillText(jpText, cx + 4, cy + 6);
    ctx.fillStyle = '#440066';
    ctx.fillText(jpText, cx + 3, cy + 4);
    ctx.fillStyle = '#aa0077';
    ctx.fillText(jpText, cx + 2, cy + 2);

    const mainGrad = ctx.createLinearGradient(cx, cy - 40, cx, cy + 10);
    mainGrad.addColorStop(0, '#00ffff');
    mainGrad.addColorStop(0.45, '#ffffff');
    mainGrad.addColorStop(0.55, '#ff88cc');
    mainGrad.addColorStop(1, '#ff0066');

    ctx.fillStyle = mainGrad;
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 18;
    ctx.fillText(jpText, cx, cy);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.strokeText(jpText, cx, cy);

    ctx.restore();
  }

  // 画面下に往年のNAMCO風「MUKKII」作者ロゴを描画
  private drawNamcoStyleMukkiiLogo(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.save();
    ctx.textAlign = 'center';

    const namcoRed = '#e60012';
    const logoText = 'mukkii';
    ctx.font = '900 28px "Arial Black", "Trebuchet MS", sans-serif';

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 9;
    ctx.strokeText(logoText, cx, cy);

    ctx.strokeStyle = namcoRed;
    ctx.lineWidth = 7;
    ctx.strokeText(logoText, cx, cy);

    ctx.fillStyle = namcoRed;
    ctx.shadowColor = 'rgba(230, 0, 18, 0.6)';
    ctx.shadowBlur = 8;
    ctx.fillText(logoText, cx, cy);

    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.fillStyle = '#8b949e';
    ctx.shadowBlur = 0;
    ctx.fillText('© 2026 MUKKII ALL RIGHTS RESERVED', cx, cy + 24);

    ctx.restore();
  }
}
