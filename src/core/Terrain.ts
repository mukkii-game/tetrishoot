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
        isWarning: false,
        warningTimer: 0.9, // 予備動作：約0.9秒間グラグラ激しく揺れてから発射
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

      // 画面内（Y=140〜520）に進入したとき、未発射なら予備動作（警告・振動フェーズ）を開始
      if (!silo.launched && !silo.isDead) {
        if (!silo.isWarning && screenY >= 140 && screenY <= 520) {
          silo.isWarning = true;
          silo.warningTimer = 0.9;
        } else if (silo.isWarning) {
          silo.warningTimer -= dt;
          // 予備動作時間が終わったら、速度を従来の半分にして発射！
          if (silo.warningTimer <= 0) {
            silo.launched = true;
            silo.isWarning = false;
            const { w1, w2 } = this.getWallThickness(screenY);
            let launchX = 0;
            let vx = 0;
            const vy = (Math.random() - 0.5) * 25; // 上下ブレも半減

            // ユーザー要望：速度は半分に（220〜270px/s → 110〜135px/s）
            if (silo.side === 'LEFT') {
              launchX = Math.max(16, w1 + 10);
              vx = 110 + Math.random() * 25;
            } else {
              launchX = Math.min(CANVAS_WIDTH - 30, CANVAS_WIDTH - w2 - 20);
              vx = -(110 + Math.random() * 25);
            }

            if (onLaunchMissile) {
              onLaunchMissile(launchX, screenY, vx, vy);
            }
          }
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
      const diagCoord = (CANVAS_HEIGHT - y) * 0.9 + this.scrollOffset;
      const { w1, w2 } = this.getWallThickness(diagCoord);
      if (w1 > 0) {
        const leftDepth = w1 + Math.floor((y - CANVAS_HEIGHT * 0.45) * 0.45);
        if (leftDepth > 0 && x < leftDepth) return true;
      }
      if (w2 > 0) {
        const rightDepth = w2 + Math.floor((CANVAS_HEIGHT * 0.55 - y) * 0.45);
        if (rightDepth > 0 && x > CANVAS_WIDTH - rightDepth) return true;
      }
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
        const diagCoord = (CANVAS_HEIGHT - y) * 0.9 + this.scrollOffset;
        const { w1, w2 } = this.getWallThickness(diagCoord);

        // 左下壁: 画面下に行くほどせり出し、時間とともに左下へ流れていく
        if (w1 > 0) {
          const depth = w1 + Math.floor((y - CANVAS_HEIGHT * 0.45) * 0.45);
          if (depth > 0) {
            const drawW = Math.min(CANVAS_WIDTH - 120, Math.floor(depth / blockSize) * blockSize);
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
        }

        // 右上壁: 画面上に行くほどせり出し、時間とともに左下へ流れていく
        if (w2 > 0) {
          const depth = w2 + Math.floor((CANVAS_HEIGHT * 0.55 - y) * 0.45);
          if (depth > 0) {
            const drawW = Math.min(CANVAS_WIDTH - 120, Math.floor(depth / blockSize) * blockSize);
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
    }

    // ★ コナミ・スクランブル風 壁面ミサイル発射台（Silo）の描画
    for (const silo of this.silos) {
      if (silo.isDead) continue;
      const screenY = silo.worldY - this.scrollOffset;
      if (screenY < -30 || screenY > CANVAS_HEIGHT + 30) continue;

      const { w1, w2 } = this.getWallThickness(screenY);
      const baseX = silo.side === 'LEFT' ? Math.max(8, w1 - 10) : CANVAS_WIDTH - w2 - 12;
      let siloX = baseX;
      let siloY = screenY - 10;

      // ユーザー要望：発射前にしばらく揺れている演出
      if (silo.isWarning) {
        const shake = Math.sin(Date.now() / 25) * 2.5;
        siloX += shake;
        siloY += (Math.cos(Date.now() / 30) * 1.5);
      }

      ctx.save();
      // 被弾点滅
      if (silo.flashTime > 0) {
        ctx.fillStyle = '#ffffff';
      } else {
        ctx.fillStyle = '#667788'; // 発射台フレーム
      }
      ctx.fillRect(siloX, siloY + 4, 24, 18);
      ctx.fillStyle = '#334455';
      ctx.fillRect(siloX + 2, siloY + 6, 20, 14);

      // ミサイル本体（未発射時）
      if (!silo.launched) {
        // 予備動作中：エンジン点火の火花＆警告フラッシュ
        if (silo.isWarning) {
          const sparkOffset = (Math.random() - 0.5) * 6;
          ctx.fillStyle = Math.random() > 0.5 ? '#ff4400' : '#ffea00';
          if (silo.side === 'LEFT') {
            ctx.fillRect(siloX - 4, siloY + 11 + sparkOffset, 5, 4);
          } else {
            ctx.fillRect(siloX + 23, siloY + 11 + sparkOffset, 5, 4);
          }
        }

        // 弾頭（赤、長めの先端コーン）
        ctx.fillStyle = '#ff2244';
        if (silo.side === 'LEFT') {
          // 右向き弾頭
          ctx.beginPath();
          ctx.moveTo(siloX + 24, siloY + 13);
          ctx.lineTo(siloX + 16, siloY + 8);
          ctx.lineTo(siloX + 16, siloY + 18);
          ctx.closePath();
          ctx.fill();
        } else {
          // 左向き弾頭
          ctx.beginPath();
          ctx.moveTo(siloX, siloY + 13);
          ctx.lineTo(siloX + 8, siloY + 8);
          ctx.lineTo(siloX + 8, siloY + 18);
          ctx.closePath();
          ctx.fill();
        }
        // ミサイル胴体（白、少し長め）
        ctx.fillStyle = '#f0f4f8';
        ctx.fillRect(siloX + 5, siloY + 10, 14, 6);

        // 発射前点滅ランプ（警告中は超高速点滅）
        const blinkRate = silo.isWarning ? 40 : 120;
        const blink = Math.sin(Date.now() / blinkRate) > 0;
        ctx.fillStyle = silo.isWarning ? (blink ? '#ff0033' : '#ffff00') : (blink ? '#ffff00' : '#ff0000');
        ctx.fillRect(siloX + 10, siloY + 1, 4, 4);
      } else {
        // 発射済みの空サイロ（黒煙痕）
        ctx.fillStyle = '#111122';
        ctx.fillRect(siloX + 4, siloY + 8, 16, 10);
      }
      ctx.restore();
    }

    ctx.restore();
  }
}
