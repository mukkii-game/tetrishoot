import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../config';

export type ScrollDirection = 'UP' | 'RIGHT' | 'LEFT' | 'DIAGONAL_UP_RIGHT';

export interface TerrainSilo {
  id: number;
  worldY: number;
  side: 'LEFT' | 'RIGHT';
  launched: boolean;
  isDead: boolean;
  hp: number;
  flashTime: number;
  isWarning: boolean;
  warningTimer: number;
}

export class TerrainManager {
  public direction: ScrollDirection = 'UP';
  public enabled = false;
  public silosEnabled = true; // 壁面ミサイル発射台の生成可否（ステージごとに切替）
  public siloStartDelay = 2.5; // ステージ開幕後、発射台が起動し始めるまでの秒数
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
    if (this.silosEnabled && nextSpawnY > this.lastSiloSpawnY) {
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
        isWarning: false,
        warningTimer: 0.9, // 予備動作：約0.9秒間グラグラ激しく揺れてから発射
      });
    }

    // ★ ユーザー要望：壁の小さな発射台は分かりづらいので廃止。
    //   画面内（Y=140〜520）に入ったらミサイル本体をすぐ壁際に出現させ、予備動作は Enemy 側で行う
    for (let i = this.silos.length - 1; i >= 0; i--) {
      const silo = this.silos[i];
      const screenY = silo.worldY - this.scrollOffset;

      if (screenY > CANVAS_HEIGHT + 60 || screenY < -60) {
        this.silos.splice(i, 1);
        continue;
      }

      if (this.elapsedTime >= this.siloStartDelay && screenY >= 140 && screenY <= 520) {
        const { w1, w2 } = this.getWallThickness(screenY);
        let launchX = 0;
        let vx = 0;
        const vy = (Math.random() - 0.5) * 25;
        if (silo.side === 'LEFT') {
          launchX = Math.max(16, w1 + 6);
          vx = 110 + Math.random() * 25;
        } else {
          launchX = Math.min(CANVAS_WIDTH - 30, CANVAS_WIDTH - w2 - 26);
          vx = -(110 + Math.random() * 25);
        }
        if (onLaunchMissile) {
          onLaunchMissile(launchX, screenY, vx, vy);
        }
        this.silos.splice(i, 1);
      }
    }
  }

  // 弾 vs 壁面サイロの命中判定（発射台は表示されなくなったため常に命中なし。互換のため残置）
  public checkBulletHit(
    _bx: number,
    _by: number,
    _bw: number,
    _bh: number
  ): { hit: boolean; score: number; x: number; y: number } | null {
    return null;
  }

  // ★ 斜めスクロール面（5面）の斜め張り出し勾配。開放ゾーンでは勾配を大きく弱め、道が広く・地形面積が減る区間を作る
  private getDiagGradient(diagCoord: number): number {
    const zonePeriod = 1400;
    const zonePhase = ((diagCoord + this.seed * 200) % zonePeriod + zonePeriod) % zonePeriod;
    const zoneRatio = zonePhase / zonePeriod;
    // 開放ゾーン（0.20〜0.35 / 0.55〜0.70 / 0.90〜1.00）は勾配 0.12、その他は 0.32（従来 0.45）
    const isOpen = (zoneRatio >= 0.20 && zoneRatio < 0.35) || (zoneRatio >= 0.55 && zoneRatio < 0.70) || zoneRatio >= 0.90;
    if (isOpen) return 0.12;
    // ゾーン境界付近はなめらかに補間
    const edges = [0.20, 0.35, 0.55, 0.70, 0.90];
    let nearest = 1;
    for (const e of edges) nearest = Math.min(nearest, Math.abs(zoneRatio - e));
    const blend = Math.min(1, nearest / 0.04);
    return 0.12 + (0.32 - 0.12) * blend;
  }

  // ★ 斜めスクロール面：画面Y座標ごとの左下壁・右上壁の張り出し幅（px）。
  //   ユーザー要望：通路は最低でも画面幅の1/3を保証（テトリミノを多く付けていても抜けられるように）
  public getDiagDepths(y: number): { left: number; right: number } {
    const diagCoord = (CANVAS_HEIGHT - y) * 0.9 + this.scrollOffset;
    const { w1, w2 } = this.getWallThickness(diagCoord);
    const grad = this.getDiagGradient(diagCoord + this.scrollOffset);
    let left = w1 > 0 ? Math.max(0, w1 + Math.floor((y - CANVAS_HEIGHT * 0.45) * grad)) : 0;
    let right = w2 > 0 ? Math.max(0, w2 + Math.floor((CANVAS_HEIGHT * 0.55 - y) * grad)) : 0;
    const minPassage = Math.floor(CANVAS_WIDTH / 3);
    const maxTotal = CANVAS_WIDTH - minPassage;
    if (left + right > maxTotal) {
      const scale = maxTotal / (left + right);
      left = Math.floor(left * scale);
      right = Math.floor(right * scale);
    }
    return { left, right };
  }

  public getWallThickness(screenCoord: number): { w1: number; w2: number } {
    if (!this.enabled) return { w1: 0, w2: 0 };

    // ステージ開始直後は洞窟の入口として壁が徐々に迫るようにテーパー（開始即死を完全防止）
    const introFactor = Math.min(1.0, this.elapsedTime / 3.0);

    // 左スクロール（自機が左へ進む）：地形は画面右から左端へ流れるので、画面座標を反転してワールド座標へ変換
    const worldCoord = this.direction === 'LEFT'
      ? (CANVAS_WIDTH - screenCoord) + this.scrollOffset
      : screenCoord + this.scrollOffset;
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
    } else if (this.direction === 'RIGHT' || this.direction === 'LEFT') {
      const { w1, w2 } = this.getWallThickness(x);
      if (y < w1) return true;
      if (y > CANVAS_HEIGHT - w2) return true;
    } else if (this.direction === 'DIAGONAL_UP_RIGHT') {
      // 斜めスクロール：左下壁と右上壁の判定
      const { left, right } = this.getDiagDepths(y);
      // 描画と同じブロック単位に量子化して判定（見た目と当たりを一致させる）
      const leftQ = Math.floor(left / 20) * 20;
      const rightQ = Math.floor(right / 20) * 20;
      if (leftQ > 0 && x < leftQ) return true;
      if (rightQ > 0 && x > CANVAS_WIDTH - rightQ) return true;
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
    } else if (this.direction === 'RIGHT' || this.direction === 'LEFT') {
      // 右スクロール：ブロックは左へ流れる／左スクロール（Stage 8）：ブロックは右へ流れる
      const isLeft = this.direction === 'LEFT';
      const startX = isLeft
        ? ((this.scrollOffset) % blockSize) - blockSize
        : -((this.scrollOffset) % blockSize);
      // 左スクロール面は緑系の岩盤カラーで差別化
      const baseColor = isLeft ? '#003818' : '#001844';
      const edgeColor = isLeft ? '#00994a' : '#0055aa';
      const hiColor = isLeft ? '#33ff99' : '#00aaff';
      for (let x = startX; x < CANVAS_WIDTH + blockSize; x += blockSize) {
        const { w1, w2 } = this.getWallThickness(x + blockSize / 2);

        // 上壁
        if (w1 > 0) {
          ctx.fillStyle = baseColor;
          ctx.fillRect(x, 0, blockSize, w1);
          const edgeBy = Math.max(0, w1 - blockSize);
          ctx.fillStyle = edgeColor;
          ctx.fillRect(x, edgeBy, blockSize, blockSize);
          ctx.fillStyle = hiColor;
          ctx.fillRect(x + 1, edgeBy + 1, blockSize - 2, 2);
          ctx.fillRect(x + 1, edgeBy + 1, 2, blockSize - 2);
        }

        // 下壁
        if (w2 > 0) {
          const by = CANVAS_HEIGHT - w2;
          ctx.fillStyle = baseColor;
          ctx.fillRect(x, by, blockSize, w2);
          ctx.fillStyle = edgeColor;
          ctx.fillRect(x, by, blockSize, blockSize);
          ctx.fillStyle = hiColor;
          ctx.fillRect(x + 1, by + 1, blockSize - 2, 2);
          ctx.fillRect(x + 1, by + 1, 2, blockSize - 2);
        }
      }
    } else if (this.direction === 'DIAGONAL_UP_RIGHT') {
      // ★ 45度斜めスクロール（自機が右上へ進む）：左下側と右上側から迫る45度斜め階段状ブロック地形！
      // y行ごとに、スクロール量とy座標から対角線座標 diagCoord を求めて各行の張り出し幅を決定
      for (let y = 0; y < CANVAS_HEIGHT + blockSize; y += blockSize) {
        const { left, right } = this.getDiagDepths(y);

        // 左下壁: 画面下に行くほどせり出し、時間とともに左下へ流れていく
        if (left > 0) {
          const drawW = Math.floor(left / blockSize) * blockSize;
          if (drawW > 0) {
            ctx.fillStyle = '#280038';
            ctx.fillRect(0, y, drawW, blockSize);
            const edgeBx = Math.max(0, drawW - blockSize);
            ctx.fillStyle = '#770088';
            ctx.fillRect(edgeBx, y, blockSize, blockSize);
            ctx.fillStyle = '#cc00ff';
            ctx.fillRect(edgeBx + 1, y + 1, blockSize - 2, 2);
            ctx.fillRect(edgeBx + 1, y + 1, 2, blockSize - 2);
          }
        }

        // 右上壁: 画面上に行くほどせり出し、時間とともに左下へ流れていく
        if (right > 0) {
          const drawW = Math.floor(right / blockSize) * blockSize;
          if (drawW > 0) {
            const rx = CANVAS_WIDTH - drawW;
            ctx.fillStyle = '#280038';
            ctx.fillRect(rx, y, drawW, blockSize);
            ctx.fillStyle = '#770088';
            ctx.fillRect(rx, y, blockSize, blockSize);
            ctx.fillStyle = '#cc00ff';
            ctx.fillRect(rx + 1, y + 1, blockSize - 2, 2);
            ctx.fillRect(rx + 1, y + 1, 2, blockSize - 2);
          }
        }
      }
    }

    ctx.restore();
  }
}
