import { BLOCK_SIZE, CANVAS_HEIGHT, CANVAS_WIDTH, LEFT_WALL_COL, RIGHT_WALL_COL } from '../config';
import { EnemyBullet } from './Bullet';
import { WallManager } from './Wall';

export type AlienRank = 'GREEN_DRONE' | 'RED_GUARD' | 'YELLOW_FLAGSHIP' | 'UFO_BOSS';
export type AlienState = 'ENTERING' | 'IN_FORMATION' | 'DIVING' | 'RETURNING';

export class Enemy {
  public id: string;
  public x: number;
  public y: number;
  public vx = 0;
  public vy = 0;
  public width: number;
  public height: number;
  public rank: AlienRank;
  public state: AlienState = 'ENTERING';
  public hp: number;
  public maxHp: number;
  public scoreValue: number;
  public isDead = false;

  // 隊列（Formation）内の目標スロット位置
  public formationX: number;
  public formationY: number;

  // アニメーション＆時間管理
  private animFrame = 0;
  private animTimer = 0;
  private timeAlive = 0;
  private stateTimer = 0;
  private flashTime = 0;
  private shootCooldown = 0;

  // ダイブ軌道パラメータ
  private diveAngle = 0;
  private divePhase = 0;
  private loopCenter = { x: 0, y: 0 };

  constructor(
    rank: AlienRank,
    formationCol: number, // 隊列の列 (0 ~ 9)
    formationRow: number, // 隊列の行 (0 ~ 3)
    entryDelay = 0
  ) {
    this.id = Math.random().toString(36).substring(2, 9);
    this.rank = rank;
    this.stateTimer = -entryDelay;

    // 隊列の基準グリッド座標
    const formBaseX = CANVAS_WIDTH / 2 - 4.5 * 38;
    const formBaseY = 100;
    this.formationX = formBaseX + formationCol * 38;
    this.formationY = formBaseY + formationRow * 32;

    // 初期進入位置（画面上部左右の外側から旋回して入ってくる）
    this.x = formationCol < 5 ? -40 : CANVAS_WIDTH + 40;
    this.y = -30 - formationRow * 20;

    switch (rank) {
      case 'GREEN_DRONE': // ギャラクシアン風ザコ（緑・青・黄）
        this.width = 24;
        this.height = 22;
        this.maxHp = 1;
        this.scoreValue = 100;
        this.shootCooldown = 2.0 + Math.random() * 2.0;
        break;
      case 'RED_GUARD': // 護衛蝶（赤・白・黄）
        this.width = 26;
        this.height = 24;
        this.maxHp = 2;
        this.scoreValue = 200;
        this.shootCooldown = 1.5 + Math.random() * 1.5;
        break;
      case 'YELLOW_FLAGSHIP': // ギャラガ司令官・イエローエイリアン
        this.width = 30;
        this.height = 26;
        this.maxHp = 3;
        this.scoreValue = 500;
        this.shootCooldown = 1.2 + Math.random() * 1.0;
        break;
      case 'UFO_BOSS': // 往年のボーナスUFO / 巨大ボス
        this.width = 44;
        this.height = 30;
        this.maxHp = 25;
        this.scoreValue = 2500;
        this.shootCooldown = 0.8;
        break;
    }
    this.hp = this.maxHp;
  }

  // ギャラガ風の挙動ステートマシン
  public update(
    dt: number,
    formationOffsetAngle: number,
    wallManager: WallManager,
    playerX: number,
    playerY: number,
    canDive: boolean
  ): EnemyBullet[] {
    this.timeAlive += dt;
    this.stateTimer += dt;
    if (this.flashTime > 0) this.flashTime -= dt;

    // 2フレームのアニメーション切り替え（0.25秒ごと）
    this.animTimer += dt;
    if (this.animTimer >= 0.25) {
      this.animTimer = 0;
      this.animFrame = 1 - this.animFrame;
    }

    const newBullets: EnemyBullet[] = [];

    // ディレイ中の進入待ち
    if (this.stateTimer < 0) {
      return newBullets;
    }

    switch (this.state) {
      // 1. 入場フェーズ：くるっと円を描いて隊列へ向かう
      case 'ENTERING': {
        const targetX = this.formationX;
        const targetY = this.formationY;
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 8) {
          this.x = targetX;
          this.y = targetY;
          this.state = 'IN_FORMATION';
          this.stateTimer = Math.random() * 4; // 次のダイブまでの猶予
        } else {
          // 弧を描きながら滑らかに隊列へ
          const speed = 220;
          this.vx = (dx / dist) * speed;
          this.vy = (dy / dist) * speed;
          this.x += this.vx * dt;
          this.y += this.vy * dt;
        }
        break;
      }

      // 2. 隊列待機フェーズ：呼吸するように左右にゆらゆら揺れる
      case 'IN_FORMATION': {
        // ギャラガ特有の全体波打ち揺れ（サイン波）
        const waveX = Math.sin(formationOffsetAngle) * 18;
        const waveY = Math.cos(formationOffsetAngle * 2) * 4;
        this.x = this.formationX + waveX;
        this.y = this.formationY + waveY;

        // 一定確率で隊列から離脱してダイブ攻撃！
        if (canDive && this.stateTimer > 4.0 + Math.random() * 3.0) {
          this.state = 'DIVING';
          this.stateTimer = 0;
          this.divePhase = 0;
          this.loopCenter = { x: this.x, y: this.y + 40 };
          this.diveAngle = -Math.PI / 2;
        }
        break;
      }

      // 3. ギャラガ名物・急降下ダイブ攻撃フェーズ（宙返りループ旋回 ＋ 突進）
      case 'DIVING': {
        if (this.divePhase === 0) {
          // 宙返りループ（くるっと一回転）
          this.diveAngle += 6.0 * dt;
          this.x = this.loopCenter.x + Math.cos(this.diveAngle) * 42;
          this.y = this.loopCenter.y + Math.sin(this.diveAngle) * 42;

          if (this.diveAngle >= Math.PI * 1.5) {
            this.divePhase = 1;
            // プレイヤーを狙って突進ベクトル計算
            const dx = playerX - this.x;
            const dy = playerY - this.y;
            const dist = Math.hypot(dx, dy) || 1;
            const diveSpeed = 190 + Math.random() * 40;
            this.vx = (dx / dist) * diveSpeed;
            this.vy = (dy / dist) * diveSpeed;

            // ダイブ開始時に弾を発射！
            newBullets.push(new EnemyBullet(this.x + this.width / 2, this.y + this.height, playerX, playerY));
          }
        } else {
          // 突進降下
          this.x += this.vx * dt;
          this.y += this.vy * dt;

          // 突進中の弾発射
          this.shootCooldown -= dt;
          if (this.shootCooldown <= 0 && this.y < CANVAS_HEIGHT - 160) {
            newBullets.push(new EnemyBullet(this.x + this.width / 2, this.y + this.height, playerX, playerY));
            this.shootCooldown = 1.6;
          }

          // 画面下部に抜けたら、上空から隊列へ戻る（ギャラガ仕様！）
          if (this.y > CANVAS_HEIGHT + 20) {
            this.y = -30;
            this.x = this.formationX;
            this.state = 'RETURNING';
          }
        }
        break;
      }

      // 4. 復帰フェーズ：上空から隊列へ戻る
      case 'RETURNING': {
        const dx = this.formationX - this.x;
        const dy = this.formationY - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 8) {
          this.state = 'IN_FORMATION';
          this.stateTimer = 0;
        } else {
          this.x += (dx / dist) * 160 * dt;
          this.y += (dy / dist) * 160 * dt;
        }
        break;
      }
    }

    // 壁（防壁ミノ）との遮り・反射
    const minWallX = (LEFT_WALL_COL + 1) * BLOCK_SIZE;
    const maxWallX = RIGHT_WALL_COL * BLOCK_SIZE - this.width;

    if (this.x < minWallX) {
      this.x = minWallX;
      this.vx = Math.abs(this.vx);
    } else if (this.x > maxWallX) {
      this.x = maxWallX;
      this.vx = -Math.abs(this.vx);
    }

    // 防壁ミノとの接触
    const leftGx = Math.floor(this.x / BLOCK_SIZE);
    const rightGx = Math.floor((this.x + this.width) / BLOCK_SIZE);
    const topGy = Math.floor(this.y / BLOCK_SIZE);
    const bottomGy = Math.floor((this.y + this.height) / BLOCK_SIZE);

    for (let gy = topGy; gy <= bottomGy; gy++) {
      for (let gx = leftGx; gx <= rightGx; gx++) {
        if (wallManager.hasBlock(gx, gy)) {
          this.vx = -this.vx;
          wallManager.damageAt(gx, gy, 0.2);
          break;
        }
      }
    }

    return newBullets;
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

  // 往年の原色レトロエイリアン＆UFOピクセルアート描画
  public draw(ctx: CanvasRenderingContext2D): void {
    if (this.y < -40 || this.y > CANVAS_HEIGHT + 40) return;

    ctx.save();
    const cx = Math.floor(this.x + this.width / 2);
    const cy = Math.floor(this.y + this.height / 2);

    if (this.flashTime > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(this.x, this.y, this.width, this.height);
      ctx.restore();
      return;
    }

    const f = this.animFrame; // 0 or 1

    switch (this.rank) {
      case 'GREEN_DRONE': {
        // ギャラクシアン風グリーンエイリアン（原色: 緑 #00ff00, 黄 #ffff00, 青 #0088ff）
        // 触角/角
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(cx - 7, cy - 10, 3, 4);
        ctx.fillRect(cx + 4, cy - 10, 3, 4);

        // 胴体（緑）
        ctx.fillStyle = '#00ee22';
        ctx.fillRect(cx - 8, cy - 6, 16, 8);

        // 羽（アニメーションで開閉）
        ctx.fillStyle = '#00aaff';
        if (f === 0) {
          ctx.fillRect(cx - 12, cy - 4, 4, 8);
          ctx.fillRect(cx + 8, cy - 4, 4, 8);
        } else {
          ctx.fillRect(cx - 11, cy - 8, 4, 8);
          ctx.fillRect(cx + 7, cy - 8, 4, 8);
        }

        // 目（赤）
        ctx.fillStyle = '#ff0033';
        ctx.fillRect(cx - 5, cy - 2, 3, 3);
        ctx.fillRect(cx + 2, cy - 2, 3, 3);

        // 尾部（黄色）
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(cx - 3, cy + 3, 6, 4);
        break;
      }

      case 'RED_GUARD': {
        // ギャラガ蝶型レッドガード（原色: 赤 #ff0044, 白 #ffffff, 黄 #ffcc00）
        // 羽（赤と白）
        ctx.fillStyle = '#ff1133';
        if (f === 0) {
          ctx.fillRect(cx - 13, cy - 6, 6, 10);
          ctx.fillRect(cx + 7, cy - 6, 6, 10);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(cx - 11, cy - 4, 3, 6);
          ctx.fillRect(cx + 8, cy - 4, 3, 6);
        } else {
          ctx.fillRect(cx - 12, cy - 10, 6, 11);
          ctx.fillRect(cx + 6, cy - 10, 6, 11);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(cx - 10, cy - 8, 3, 7);
          ctx.fillRect(cx + 7, cy - 8, 3, 7);
        }

        // コア（白＆黄色）
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx - 4, cy - 8, 8, 14);
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(cx - 2, cy - 4, 4, 6);
        // 目
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(cx - 3, cy - 6, 2, 2);
        ctx.fillRect(cx + 1, cy - 6, 2, 2);
        break;
      }

      case 'YELLOW_FLAGSHIP': {
        // ギャラガ旗艦・イエローエイリアン（原色: 黄 #ffea00, 青 #0044ff, 赤 #ff0033）
        // 巨大な黄色い爪/触角
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(cx - 14, cy - 12, 5, 8);
        ctx.fillRect(cx + 9, cy - 12, 5, 8);

        // 胴体（青と黄）
        ctx.fillStyle = '#0055ff';
        ctx.fillRect(cx - 10, cy - 6, 20, 10);
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(cx - 6, cy - 4, 12, 8);

        // 羽
        ctx.fillStyle = '#ff2244';
        if (f === 0) {
          ctx.fillRect(cx - 14, cy - 1, 4, 7);
          ctx.fillRect(cx + 10, cy - 1, 4, 7);
        } else {
          ctx.fillRect(cx - 15, cy - 5, 4, 8);
          ctx.fillRect(cx + 11, cy - 5, 4, 8);
        }

        // コアアイ（赤とシアン）
        ctx.fillStyle = '#ff0033';
        ctx.fillRect(cx - 3, cy - 2, 6, 4);
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(cx - 1, cy - 1, 2, 2);
        break;
      }

      case 'UFO_BOSS': {
        // スペースインベーダー／ギャラクシアン風の往年クラシックUFO！
        // UFOドーム（シアン＆白）
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(cx - 10, cy - 14, 20, 6);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx - 6, cy - 12, 12, 3);

        // 円盤メインボディ（鮮やかな赤 #ff0044）
        ctx.fillStyle = '#ff0044';
        ctx.fillRect(cx - 21, cy - 8, 42, 10);
        ctx.fillRect(cx - 16, cy + 2, 32, 6);

        // 電飾ランプ（黄色と緑がチカチカ点滅）
        ctx.fillStyle = f === 0 ? '#ffea00' : '#00ff66';
        ctx.fillRect(cx - 16, cy - 4, 4, 4);
        ctx.fillRect(cx - 6, cy - 4, 4, 4);
        ctx.fillRect(cx + 3, cy - 4, 4, 4);
        ctx.fillRect(cx + 13, cy - 4, 4, 4);

        // 底面反重力ノズル（黄色）
        ctx.fillStyle = '#ffaa00';
        ctx.fillRect(cx - 10, cy + 8, 20, 3);

        // HPバー
        const hpRatio = Math.max(0, this.hp / this.maxHp);
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(cx - 20, cy - 20, 40, 4);
        ctx.fillStyle = hpRatio > 0.3 ? '#00ff88' : '#ff0044';
        ctx.fillRect(cx - 20, cy - 20, 40 * hpRatio, 4);
        break;
      }
    }

    ctx.restore();
  }
}
