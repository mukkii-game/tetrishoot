import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../config';

export type ScrollDirection = 'UP' | 'RIGHT' | 'DIAGONAL_UP_RIGHT';

export interface TerrainSilo {
  id: number;
  worldY: number;
  side: 'LEFT' | 'RIGHT';
  launched: boolean;
  isDead: boolean;
  hp: number;
  flashTime: number;
}

export class TerrainManager {
  public direction: ScrollDirection = 'UP';
  public enabled = false;
  private scrollOffset = 0;
  private seed = 42;
  public elapsedTime = 0;

  // ★ コナミ・スクランブル風 地形配置ロケット発射台（Silo）
  public silos: TerrainSilo[] = [];
  private nextSiloId = 1;
  private lastSiloSpawnY = 0;

  constructor() {
    this.reset();
  }

  public reset(direction: ScrollDirection = 'UP', enabled = true): void {
    this.direction = direction;
    this.enabled = enabled;
    this.scrollOffset = 0;
    this.elapsedTime = 0;
    this.seed = Math.random() * 1000;
    this.silos = [];
    this.lastSiloSpawnY = 0;
  }

  public update(
    dt: number,
    speed: number,
    onLaunchMissile?: (x: number, y: number, vx: number, vy: number) => void
  ): void {
    if (!this.enabled) return;
    this.scrollOffset += speed * dt;
    this.elapsedTime += dt;

    // ★ 洞窟壁サイロの生成（約260pxスクロールごと）
    const nextSpawnY = Math.floor((this.scrollOffset + 720) / 260) * 260;
    if (nextSpawnY > this.lastSiloSpawnY) {
      this.lastSiloSpawnY = nextSpawnY;
      const side = Math.random() > 0.5 ? 'LEFT' : 'RIGHT';
      this.silos.push({
        id: this.nextSiloId++,
        worldY: nextSpawnY,
        side,
        launched: false,
        isDead: false,
        hp: 1,
        flashTime: 0,
      });
    }

    // サイロの更新＆ロケット発射判定
    for (let i = this.silos.length - 1; i >= 0; i--) {
      const silo = this.silos[i];
      if (silo.flashTime > 0) silo.flashTime -= dt;

      const screenY = silo.worldY - this.scrollOffset;

      // 画面下端を抜けたら消去
      if (screenY > CANVAS_HEIGHT + 60) {
        this.silos.splice(i, 1);
        continue;
      }

      // 画面内（Y=120〜520）に進入し、未発射なら自機方向へミサイル水平発射！
      if (!silo.launched && !silo.isDead && screenY >= 140 && screenY <= 520) {
        silo.launched = true;
        const { w1, w2 } = this.getWallThickness(screenY);
        let launchX = 0;
        let vx = 0;
        const vy = (Math.random() - 0.5) * 50;

        if (silo.side === 'LEFT') {
          launchX = Math.max(16, w1 + 10);
          vx = 220 + Math.random() * 50; // 右の中央通路へ噴射加速！
        } else {
          launchX = Math.min(CANVAS_WIDTH - 30, CANVAS_WIDTH - w2 - 20);
          vx = -(220 + Math.random() * 50); // 左の中央通路へ噴射加速！
        }

        if (onLaunchMissile) {
          onLaunchMissile(launchX, screenY, vx, vy);
        }
      }
    }
  }

  // 弾 vs 壁面サイロの命中判定（発射前・後どちらも撃破可能！）
  public checkBulletHit(
    bx: number,
    by: number,
    bw: number,
    bh: number
  ): { hit: boolean; score: number; x: number; y: number } | null {
    if (!this.enabled) return null;

    for (const silo of this.silos) {
      if (silo.isDead) continue;
      const screenY = silo.worldY - this.scrollOffset;
      if (screenY < -30 || screenY > CANVAS_HEIGHT + 30) continue;

      const { w1, w2 } = this.getWallThickness(screenY);
      const siloX = silo.side === 'LEFT' ? Math.max(8, w1 - 10) : CANVAS_WIDTH - w2 - 12;
      const siloY = screenY - 12;
      const sw = 22;
      const sh = 24;

      if (
        bx + bw / 2 >= siloX &&
        bx - bw / 2 <= siloX + sw &&
        by + bh / 2 >= siloY &&
        by - bh / 2 <= siloY + sh
      ) {
        silo.hp -= 1;
        silo.flashTime = 0.12;
        if (silo.hp <= 0) {
          silo.isDead = true;
          return { hit: true, score: 500, x: siloX + sw / 2, y: siloY + sh / 2 };
        }
        return { hit: true, score: 100, x: siloX + sw / 2, y: siloY + sh / 2 };
      }
    }
    return null;
  }

  public getWallThickness(screenCoord: number): { w1: number; w2: number } {
    if (!this.enabled) return { w1: 0, w2: 0 };

    // ステージ開始直後は洞窟の入口として壁が徐々に迫るようにテーパー（開始即死を完全防止）
    const introFactor = Math.min(1.0, this.elapsedTime / 3.0);

    const worldCoord = screenCoord + this.scrollOffset;
    const s = this.seed;

    // ユーザー要望：
    // 「時々、左側しか通れない、右側しか通れない、真ん中しか通れない、左右の地面自体が隆起したりくぼんだりでその時により安全地帯が異なる、という位置取りの遊び」
    // 大きな周期ゾーン（約1200〜1600pxごと、時間にして約8〜12秒ごと）で地形の主導権がダイナミックに変化！
    const zonePeriod = 1400;
    const zonePhase = ((worldCoord + s * 200) % zonePeriod + zonePeriod) % zonePeriod;
    const zoneRatio = zonePhase / zonePeriod; // 0.0 ~ 1.0

    // zoneType:
    // 0.00 ~ 0.20: 【中央突破ゾーン】左右両側から隆起し、中央の細いスリットしか通れない
    // 0.20 ~ 0.35: 【開放・くぼみゾーン】左右とも大きく凹み、広く戦える安全地帯
    // 0.35 ~ 0.55: 【左側スリットゾーン】右側から巨大な岩盤が張り出し、左端の狭い通路しか通れない
    // 0.55 ~ 0.70: 【開放・うねりゾーン】左右が交互に波打つ
    // 0.70 ~ 0.90: 【右側スリットゾーン】左側から巨大な岩盤が張り出し、右端の狭い通路しか通れない
    // 0.90 ~ 1.00: 【開放ゾーン】

    let biasLeft = 0;   // 左壁の追加張り出し (px)
    let biasRight = 0;  // 右壁の追加張り出し (px)

    if (zoneRatio < 0.20) {
      // 中央のみ通路（左・右双方が大きくせり出す）
      const bell = Math.sin((zoneRatio / 0.20) * Math.PI);
      biasLeft = bell * 130;
      biasRight = bell * 130;
    } else if (zoneRatio >= 0.35 && zoneRatio < 0.55) {
      // 左側のみ通路（右壁が画面の65%以上まで大きく張り出す！）
      const bell = Math.sin(((zoneRatio - 0.35) / 0.20) * Math.PI);
      biasRight = bell * 230;
      biasLeft = -bell * 20; // 左側は少し凹んで通りやすく
    } else if (zoneRatio >= 0.70 && zoneRatio < 0.90) {
      // 右側のみ通路（左壁が画面の65%以上まで大きく張り出す！）
      const bell = Math.sin(((zoneRatio - 0.70) / 0.20) * Math.PI);
      biasLeft = bell * 230;
      biasRight = -bell * 20; // 右側は少し凹んで通りやすく
    }

    // 80年代レトロアーケードらしい岩肌の細かい凹凸ノイズ
    const n1 = Math.sin(worldCoord * 0.004 + s);
    const n2 = Math.sin(worldCoord * 0.01 + s * 1.5) * 0.45;
    const n3 = Math.sin(worldCoord * 0.024 + s * 2.3) * 0.25;
    const baseVal1 = Math.max(0, (n1 + n2 + n3 + 0.35) / 1.7);

    const m1 = Math.sin(worldCoord * 0.0042 + s + 3.14);
    const m2 = Math.sin(worldCoord * 0.011 + s * 1.8) * 0.45;
    const m3 = Math.sin(worldCoord * 0.022 + s * 2.7) * 0.25;
    const baseVal2 = Math.max(0, (m1 + m2 + m3 + 0.35) / 1.7);

    if (this.direction === 'UP') {
      const baseReach = 95;
      const totalWidth = CANVAS_WIDTH; // 540
      const minPassage = 155; // 自機が通過可能な最低クリアランス（約5ブロック分）

      let w1 = Math.floor((baseVal1 * baseReach + biasLeft) * introFactor);
      let w2 = Math.floor((baseVal2 * baseReach + biasRight) * introFactor);

      // 安全制限：通路が完全に塞がれて詰まないよう保証
      if (w1 + w2 > totalWidth - minPassage) {
        const excess = (w1 + w2) - (totalWidth - minPassage);
        const half = Math.ceil(excess / 2);
        w1 = Math.max(0, w1 - half);
        w2 = Math.max(0, w2 - half);
      }

      // ユーザー要望：SNKのバンガードのようなブロックによるカクカクした山鳴り地形
      // BLOCK_SIZE (20px) 単位で階段状・山鳴りブロックに量子化
      const blockSize = 20;
      w1 = Math.floor(w1 / blockSize) * blockSize;
      w2 = Math.floor(w2 / blockSize) * blockSize;

      return { w1: Math.max(0, w1), w2: Math.max(0, w2) };
    } else {
      const baseReach = 110;
      const totalHeight = CANVAS_HEIGHT; // 720
      const minPassage = 180;

      let w1 = Math.floor((baseVal1 * baseReach + biasLeft) * introFactor);
      let w2 = Math.floor((baseVal2 * baseReach + biasRight) * introFactor);

      if (w1 + w2 > totalHeight - minPassage) {
        const excess = (w1 + w2) - (totalHeight - minPassage);
        const half = Math.ceil(excess / 2);
        w1 = Math.max(0, w1 - half);
        w2 = Math.max(0, w2 - half);
      }

      const blockSize = 20;
      w1 = Math.floor(w1 / blockSize) * blockSize;
      w2 = Math.floor(w2 / blockSize) * blockSize;

      return { w1: Math.max(0, w1), w2: Math.max(0, w2) };
    }
  }

  public isColliding(x: number, y: number): boolean {
    if (!this.enabled) return false;

    if (this.direction === 'UP') {
      const { w1, w2 } = this.getWallThickness(y);
      if (x < w1) return true;
      if (x > CANVAS_WIDTH - w2) return true;
    } else if (this.direction === 'RIGHT') {
      const { w1, w2 } = this.getWallThickness(x);
      if (y < w1) return true;
      if (y > CANVAS_HEIGHT - w2) return true;
    } else if (this.direction === 'DIAGONAL_UP_RIGHT') {
      // 斜めスクロール：対角線に沿った山鳴り地形判定
      const diagCoord = (x + y) * 0.707;
      const { w1, w2 } = this.getWallThickness(diagCoord);
      // 左下壁（xが小さくyが大きい領域）
      if (x + (CANVAS_HEIGHT - y) < w1 * 1.4) return true;
      // 右上壁（xが大きくyが小さい領域）
      if ((CANVAS_WIDTH - x) + y < w2 * 1.4) return true;
    }
    return false;
  }

  public isRectColliding(x: number, y: number, width: number, height: number): boolean {
    if (!this.enabled) return false;
    const samplePoints = [
      { x, y },
      { x: x + width, y },
      { x, y: y + height },
      { x: x + width, y: y + height },
      { x: x + width / 2, y },
      { x: x + width / 2, y: y + height },
      { x, y: y + height / 2 },
      { x: x + width, y: y + height / 2 },
    ];

    for (const pt of samplePoints) {
      if (this.isColliding(pt.x, pt.y)) return true;
    }
    return false;
  }

  // ★ SNK『バンガード (Vanguard)』風：ブロックによるカクカクした山鳴り地形描画（バッチ高速化版）
  public draw(ctx: CanvasRenderingContext2D): void {
    if (!this.enabled) return;

    ctx.save();
    const blockSize = 20; // バンガード風のブロック単位

    if (this.direction === 'UP') {
      const startY = -((this.scrollOffset) % blockSize);
      for (let y = startY; y < CANVAS_HEIGHT + blockSize; y += blockSize) {
        const { w1, w2 } = this.getWallThickness(y + blockSize / 2);

        // 左壁：ソリッドベース＋表面立体ベベルブロック
        if (w1 > 0) {
          ctx.fillStyle = '#441800';
          ctx.fillRect(0, y, w1, blockSize);
          const edgeBx = Math.max(0, w1 - blockSize);
          ctx.fillStyle = '#aa4400';
          ctx.fillRect(edgeBx, y, blockSize, blockSize);
          ctx.fillStyle = '#ff8800';
          ctx.fillRect(edgeBx + 1, y + 1, blockSize - 2, 2);
          ctx.fillRect(edgeBx + 1, y + 1, 2, blockSize - 2);
          ctx.fillStyle = '#220800';
          ctx.fillRect(edgeBx + blockSize - 2, y, 2, blockSize);
          ctx.fillRect(edgeBx, y + blockSize - 2, blockSize, 2);
        }

        // 右壁：ソリッドベース＋表面立体ベベルブロック
        if (w2 > 0) {
          const rx = CANVAS_WIDTH - w2;
          ctx.fillStyle = '#441800';
          ctx.fillRect(rx, y, w2, blockSize);
          ctx.fillStyle = '#aa4400';
          ctx.fillRect(rx, y, blockSize, blockSize);
          ctx.fillStyle = '#ff8800';
          ctx.fillRect(rx + 1, y + 1, blockSize - 2, 2);
          ctx.fillRect(rx + 1, y + 1, 2, blockSize - 2);
          ctx.fillStyle = '#220800';
          ctx.fillRect(rx + blockSize - 2, y, 2, blockSize);
          ctx.fillRect(rx, y + blockSize - 2, blockSize, 2);
        }
      }
    } else if (this.direction === 'RIGHT') {
      const startX = -((this.scrollOffset) % blockSize);
      for (let x = startX; x < CANVAS_WIDTH + blockSize; x += blockSize) {
        const { w1, w2 } = this.getWallThickness(x + blockSize / 2);

        // 上壁
        if (w1 > 0) {
          ctx.fillStyle = '#001844';
          ctx.fillRect(x, 0, blockSize, w1);
          const edgeBy = Math.max(0, w1 - blockSize);
          ctx.fillStyle = '#0055aa';
          ctx.fillRect(x, edgeBy, blockSize, blockSize);
          ctx.fillStyle = '#00aaff';
          ctx.fillRect(x + 1, edgeBy + 1, blockSize - 2, 2);
          ctx.fillRect(x + 1, edgeBy + 1, 2, blockSize - 2);
        }

        // 下壁
        if (w2 > 0) {
          const by = CANVAS_HEIGHT - w2;
          ctx.fillStyle = '#001844';
          ctx.fillRect(x, by, blockSize, w2);
          ctx.fillStyle = '#0055aa';
          ctx.fillRect(x, by, blockSize, blockSize);
          ctx.fillStyle = '#00aaff';
          ctx.fillRect(x + 1, by + 1, blockSize - 2, 2);
          ctx.fillRect(x + 1, by + 1, 2, blockSize - 2);
        }
      }
    } else if (this.direction === 'DIAGONAL_UP_RIGHT') {
      const start = -((this.scrollOffset) % blockSize);
      for (let y = start; y < CANVAS_HEIGHT + blockSize; y += blockSize) {
        const { w1, w2 } = this.getWallThickness(y + blockSize / 2);
        if (w1 > 0) {
          ctx.fillStyle = '#280038';
          ctx.fillRect(0, y, w1, blockSize);
          const edgeBx = Math.max(0, w1 - blockSize);
          ctx.fillStyle = '#770088';
          ctx.fillRect(edgeBx, y, blockSize, blockSize);
          ctx.fillStyle = '#cc00ff';
          ctx.fillRect(edgeBx + 1, y + 1, blockSize - 2, 2);
        }
        if (w2 > 0) {
          const rx = CANVAS_WIDTH - w2;
          ctx.fillStyle = '#280038';
          ctx.fillRect(rx, y, w2, blockSize);
          ctx.fillStyle = '#770088';
          ctx.fillRect(rx, y, blockSize, blockSize);
          ctx.fillStyle = '#cc00ff';
          ctx.fillRect(rx + 1, y + 1, blockSize - 2, 2);
        }
      }
    }

    // ★ コナミ・スクランブル風 壁面ミサイル発射台（Silo）の描画
    for (const silo of this.silos) {
      if (silo.isDead) continue;
      const screenY = silo.worldY - this.scrollOffset;
      if (screenY < -30 || screenY > CANVAS_HEIGHT + 30) continue;

      const { w1, w2 } = this.getWallThickness(screenY);
      const siloX = silo.side === 'LEFT' ? Math.max(8, w1 - 10) : CANVAS_WIDTH - w2 - 12;
      const siloY = screenY - 10;

      ctx.save();
      // 被弾点滅
      if (silo.flashTime > 0) {
        ctx.fillStyle = '#ffffff';
      } else {
        ctx.fillStyle = '#667788'; // 発射台フレーム
      }
      ctx.fillRect(siloX, siloY + 4, 22, 16);
      ctx.fillStyle = '#334455';
      ctx.fillRect(siloX + 2, siloY + 6, 18, 12);

      // ミサイル本体（未発射時）
      if (!silo.launched) {
        // 弾頭（赤）
        ctx.fillStyle = '#ff2244';
        if (silo.side === 'LEFT') {
          // 右向き弾頭
          ctx.beginPath();
          ctx.moveTo(siloX + 22, siloY + 12);
          ctx.lineTo(siloX + 16, siloY + 7);
          ctx.lineTo(siloX + 16, siloY + 17);
          ctx.closePath();
          ctx.fill();
        } else {
          // 左向き弾頭
          ctx.beginPath();
          ctx.moveTo(siloX, siloY + 12);
          ctx.lineTo(siloX + 6, siloY + 7);
          ctx.lineTo(siloX + 6, siloY + 17);
          ctx.closePath();
          ctx.fill();
        }
        // ミサイル胴体（白）
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(siloX + 6, siloY + 9, 10, 6);

        // 発射前点滅ランプ
        const blink = Math.sin(Date.now() / 100) > 0;
        ctx.fillStyle = blink ? '#ffff00' : '#ff0000';
        ctx.fillRect(siloX + 9, siloY + 2, 4, 3);
      } else {
        // 発射済みの空サイロ（黒煙痕）
        ctx.fillStyle = '#111122';
        ctx.fillRect(siloX + 4, siloY + 8, 14, 8);
      }
      ctx.restore();
    }

    ctx.restore();
  }
}
