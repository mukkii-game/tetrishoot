import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../config';

export type AlienRank =
  | 'GREEN_DRONE'      // 小型グリーン
  | 'RED_GUARD'        // 小型レッド
  | 'YELLOW_COMMANDER' // 小型イエロー
  | 'GIANT_RED'        // 倍サイズ大型レッド
  | 'GIANT_YELLOW'     // 倍サイズ大型イエロー
  | 'UFO_MOTHERSHIP';  // 超大型ボスUFO

export type CurvePathType =
  | 'FIGURE_EIGHT'         // ギャラガ8の字ループ
  | 'S_CURVE_LEFT_TO_RIGHT'// 左から右へのS字蛇行
  | 'S_CURVE_RIGHT_TO_LEFT'// 右から左へのS字蛇行
  | 'INFINITY_DIVE_LEFT'   // 左からの宙返り急降下
  | 'INFINITY_DIVE_RIGHT';  // 右からの宙返り急降下

export type FlightPattern =
  | 'STREAM_CURVE'        // ★ ギャプラス風・曲線を描いて連なる大編隊！
  | 'FORMATION_LOOP'
  | 'SWEEP_FROM_LEFT'
  | 'SWEEP_FROM_RIGHT'
  | 'SURPRISE_FROM_BOTTOM'
  | 'CAROUSEL_CIRCLE'
  | 'IN_FORMATION'
  | 'KAMIKAZE_DIVE'
  | 'RETURNING';

export class Enemy {
  public id: string;
  public x: number;
  public y: number;
  public vx = 0;
  public vy = 0;
  public width: number;
  public height: number;
  public rank: AlienRank;
  public pattern: FlightPattern;
  public hp: number;
  public maxHp: number;
  public scoreValue: number;
  public isDead = false;

  public formationX: number;
  public formationY: number;

  // ストリーム曲線編隊パラメータ
  public curveType?: CurvePathType;
  public streamDelay = 0; // 連隊内の順番ディレイ (0.12秒刻み)
  public streamProgress = 0;

  private animFrame = 0;
  private animTimer = 0;
  private timeAlive = 0;
  private patternTimer = 0;
  private flashTime = 0;

  private circleCenterX = CANVAS_WIDTH / 2;
  private circleCenterY = CANVAS_HEIGHT * 0.38;
  private circleRadius = 145;
  private circleAngle = 0;
  private diveAngle = 0;
  private diveTargetX = CANVAS_WIDTH / 2;
  private diveTargetY = CANVAS_HEIGHT;

  constructor(
    rank: AlienRank,
    pattern: FlightPattern,
    formationCol: number,
    formationRow: number,
    spawnDelay = 0,
    curveType?: CurvePathType,
    streamIndex = 0
  ) {
    this.id = Math.random().toString(36).substring(2, 9);
    this.rank = rank;
    this.pattern = pattern;
    this.patternTimer = -spawnDelay;
    this.curveType = curveType;
    this.streamDelay = streamIndex * 0.11; // 1機ごとの美しい等間隔
    this.streamProgress = -this.streamDelay;

    const spacingX = 46;
    const spacingY = 40;
    this.formationX = CANVAS_WIDTH / 2 + (formationCol - 4.5) * spacingX;
    this.formationY = 65 + formationRow * spacingY;

    // 敵サイズ（一回り大きく迫力満点！）
    switch (rank) {
      case 'GREEN_DRONE':
        this.width = 34;
        this.height = 30;
        this.maxHp = 1;
        this.scoreValue = 100;
        break;
      case 'RED_GUARD':
        this.width = 38;
        this.height = 34;
        this.maxHp = 2;
        this.scoreValue = 200;
        break;
      case 'YELLOW_COMMANDER':
        this.width = 44;
        this.height = 38;
        this.maxHp = 3;
        this.scoreValue = 400;
        break;
      case 'GIANT_RED':
        this.width = 72;
        this.height = 66;
        this.maxHp = 8;
        this.scoreValue = 1200;
        break;
      case 'GIANT_YELLOW':
        this.width = 84;
        this.height = 74;
        this.maxHp = 12;
        this.scoreValue = 1800;
        break;
      case 'UFO_MOTHERSHIP':
        this.width = 124;
        this.height = 78;
        this.maxHp = 35;
        this.scoreValue = 5000;
        break;
    }
    this.hp = this.maxHp;

    this.x = -100;
    this.y = -100;
  }

  public update(
    dt: number,
    formationOffsetAngle: number,
    playerX: number,
    playerY: number,
    canDive: boolean
  ): void {
    this.timeAlive += dt;
    this.patternTimer += dt;
    if (this.flashTime > 0) this.flashTime -= dt;

    this.animTimer += dt;
    if (this.animTimer >= 0.22) {
      this.animTimer = 0;
      this.animFrame = 1 - this.animFrame;
    }

    if (this.patternTimer < 0) return;

    switch (this.pattern) {
      // ★ ギャプラス＆ギャラガ完全再現：曲線で連なって流れる美しい大編隊！
      case 'STREAM_CURVE': {
        this.streamProgress += dt * 0.95; // 進行速度
        const t = this.streamProgress;

        if (t < 0) {
          this.x = -100;
          this.y = -100;
          return;
        }

        const pos = this.computeCurvePosition(t, this.curveType || 'FIGURE_EIGHT');
        this.x = pos.x;
        this.y = pos.y;

        // 曲線飛行が完了したら隊列へ合流！
        if (t >= 4.2) {
          this.pattern = 'FORMATION_LOOP';
        }
        break;
      }

      case 'FORMATION_LOOP': {
        const dx = this.formationX - this.x;
        const dy = this.formationY - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 10) {
          this.x = this.formationX;
          this.y = this.formationY;
          this.pattern = 'IN_FORMATION';
          this.patternTimer = Math.random() * 3;
        } else {
          const speed = 250;
          this.x += (dx / dist) * speed * dt;
          this.y += (dy / dist) * speed * dt;
        }
        break;
      }

      case 'SWEEP_FROM_LEFT': {
        this.x += this.vx * dt;
        this.y += Math.sin(this.timeAlive * 5) * 110 * dt;
        if (this.x > CANVAS_WIDTH + 30) {
          this.pattern = 'FORMATION_LOOP';
        }
        break;
      }

      case 'SWEEP_FROM_RIGHT': {
        this.x += this.vx * dt;
        this.y += Math.sin(this.timeAlive * 5) * 110 * dt;
        if (this.x < -this.width - 30) {
          this.pattern = 'FORMATION_LOOP';
        }
        break;
      }

      case 'SURPRISE_FROM_BOTTOM': {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        if (this.y < 90) {
          this.pattern = 'FORMATION_LOOP';
        }
        break;
      }

      case 'CAROUSEL_CIRCLE': {
        this.circleAngle += 2.2 * dt;
        this.x = this.circleCenterX + Math.cos(this.circleAngle) * this.circleRadius;
        this.y = this.circleCenterY + Math.sin(this.circleAngle) * this.circleRadius;

        if (this.patternTimer > 5.0) {
          this.pattern = 'KAMIKAZE_DIVE';
          this.diveTargetX = playerX;
          this.diveTargetY = playerY;
          this.diveAngle = -Math.PI / 2;
        }
        break;
      }

      case 'IN_FORMATION': {
        const waveX = Math.sin(formationOffsetAngle) * 22;
        const waveY = Math.cos(formationOffsetAngle * 2) * 6;
        this.x = this.formationX + waveX;
        this.y = this.formationY + waveY;

        // 隊列から離脱して体当たり急降下！
        if (canDive && this.patternTimer > 3.0 + Math.random() * 4.0) {
          this.pattern = 'KAMIKAZE_DIVE';
          this.patternTimer = 0;
          this.diveAngle = -Math.PI / 2;
          this.diveTargetX = playerX;
          this.diveTargetY = playerY;
        }
        break;
      }

      case 'KAMIKAZE_DIVE': {
        if (this.patternTimer < 0.6) {
          this.diveAngle += 10.0 * dt;
          this.x += Math.cos(this.diveAngle) * 160 * dt;
          this.y += Math.sin(this.diveAngle) * 160 * dt;
        } else {
          const dx = this.diveTargetX - this.x;
          const dy = (this.diveTargetY + 60) - this.y;
          const dist = Math.hypot(dx, dy) || 1;
          const speed = 250 + (this.rank.startsWith('GIANT') ? 60 : 30);
          this.x += (dx / dist) * speed * dt;
          this.y += Math.max(120, (dy / dist) * speed) * dt;

          if (this.y > CANVAS_HEIGHT + 30) {
            this.y = -40;
            this.x = this.formationX;
            this.pattern = 'RETURNING';
          }
        }
        break;
      }

      case 'RETURNING': {
        const dx = this.formationX - this.x;
        const dy = this.formationY - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 10) {
          this.pattern = 'IN_FORMATION';
          this.patternTimer = 0;
        } else {
          this.x += (dx / dist) * 180 * dt;
          this.y += (dy / dist) * 180 * dt;
        }
        break;
      }
    }
  }

  // 美しい曲線のパラメトリック座標計算
  private computeCurvePosition(t: number, path: CurvePathType): { x: number; y: number } {
    const cx = CANVAS_WIDTH / 2;

    switch (path) {
      // 1. ギャラガ8の字ループ（リサジューインフィニティ）
      case 'FIGURE_EIGHT': {
        const angle = t * Math.PI * 1.35;
        const x = cx + Math.sin(angle) * 190;
        const y = 220 + Math.sin(angle * 2) * 110;
        return { x: x - this.width / 2, y: y - this.height / 2 };
      }

      // 2. 左から優雅なS字蛇行で画面を渡る
      case 'S_CURVE_LEFT_TO_RIGHT': {
        const progressX = (t / 4.0) * (CANVAS_WIDTH + 140) - 70;
        const y = 80 + Math.sin(t * 3.2) * 130 + t * 45;
        return { x: progressX - this.width / 2, y: y - this.height / 2 };
      }

      // 3. 右から優雅なS字蛇行で画面を渡る
      case 'S_CURVE_RIGHT_TO_LEFT': {
        const progressX = CANVAS_WIDTH + 70 - (t / 4.0) * (CANVAS_WIDTH + 140);
        const y = 80 + Math.cos(t * 3.2) * 130 + t * 45;
        return { x: progressX - this.width / 2, y: y - this.height / 2 };
      }

      // 4. 左からのダイナミック宙返りループ
      case 'INFINITY_DIVE_LEFT': {
        const angle = t * 2.8;
        const x = cx - 90 + Math.cos(angle) * 130;
        const y = 140 + Math.sin(angle) * 130 + t * 65;
        return { x: x - this.width / 2, y: y - this.height / 2 };
      }

      // 5. 右からのダイナミック宙返りループ
      case 'INFINITY_DIVE_RIGHT': {
        const angle = -t * 2.8;
        const x = cx + 90 + Math.cos(angle) * 130;
        const y = 140 + Math.sin(angle) * 130 + t * 65;
        return { x: x - this.width / 2, y: y - this.height / 2 };
      }
    }
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

  public draw(ctx: CanvasRenderingContext2D): void {
    if (this.y < -70 || this.y > CANVAS_HEIGHT + 70) return;

    ctx.save();
    const cx = Math.floor(this.x + this.width / 2);
    const cy = Math.floor(this.y + this.height / 2);

    if (this.flashTime > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(this.x, this.y, this.width, this.height);
      ctx.restore();
      return;
    }

    const f = this.animFrame;
    const isGiant = this.rank === 'GIANT_RED' || this.rank === 'GIANT_YELLOW' || this.rank === 'UFO_MOTHERSHIP';
    const s = isGiant ? 2.8 : 1.4;

    ctx.translate(cx, cy);
    ctx.scale(s, s);

    switch (this.rank) {
      case 'GREEN_DRONE': {
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(-7, -10, 3, 4);
        ctx.fillRect(4, -10, 3, 4);
        ctx.fillStyle = '#00ee22';
        ctx.fillRect(-8, -6, 16, 8);
        ctx.fillStyle = '#00aaff';
        if (f === 0) {
          ctx.fillRect(-12, -4, 4, 8);
          ctx.fillRect(8, -4, 4, 8);
        } else {
          ctx.fillRect(-11, -8, 4, 8);
          ctx.fillRect(7, -8, 4, 8);
        }
        ctx.fillStyle = '#ff0033';
        ctx.fillRect(-5, -2, 3, 3);
        ctx.fillRect(2, -2, 3, 3);
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(-3, 3, 6, 4);
        break;
      }

      case 'RED_GUARD':
      case 'GIANT_RED': {
        ctx.fillStyle = '#ff1133';
        if (f === 0) {
          ctx.fillRect(-13, -6, 6, 10);
          ctx.fillRect(7, -6, 6, 10);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-11, -4, 3, 6);
          ctx.fillRect(8, -4, 3, 6);
        } else {
          ctx.fillRect(-12, -10, 6, 11);
          ctx.fillRect(6, -10, 6, 11);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-10, -8, 3, 7);
          ctx.fillRect(7, -8, 3, 7);
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-4, -8, 8, 14);
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(-2, -4, 4, 6);
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(-3, -6, 2, 2);
        ctx.fillRect(1, -6, 2, 2);
        break;
      }

      case 'YELLOW_COMMANDER':
      case 'GIANT_YELLOW': {
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(-14, -12, 5, 8);
        ctx.fillRect(9, -12, 5, 8);
        ctx.fillStyle = '#0055ff';
        ctx.fillRect(-10, -6, 20, 10);
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(-6, -4, 12, 8);
        ctx.fillStyle = '#ff2244';
        if (f === 0) {
          ctx.fillRect(-14, -1, 4, 7);
          ctx.fillRect(10, -1, 4, 7);
        } else {
          ctx.fillRect(-15, -5, 4, 8);
          ctx.fillRect(11, -5, 4, 8);
        }
        ctx.fillStyle = '#ff0033';
        ctx.fillRect(-3, -2, 6, 4);
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(-1, -1, 2, 2);
        break;
      }

      case 'UFO_MOTHERSHIP': {
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(-12, -14, 24, 7);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-8, -12, 16, 4);

        ctx.fillStyle = '#ff0044';
        ctx.fillRect(-22, -7, 44, 11);
        ctx.fillRect(-16, 4, 32, 6);

        ctx.fillStyle = f === 0 ? '#ffea00' : '#00ff66';
        ctx.fillRect(-18, -4, 5, 5);
        ctx.fillRect(-7, -4, 5, 5);
        ctx.fillRect(3, -4, 5, 5);
        ctx.fillRect(14, -4, 5, 5);

        ctx.fillStyle = '#ffaa00';
        ctx.fillRect(-11, 10, 22, 4);
        break;
      }
    }

    if (isGiant) {
      const hpRatio = Math.max(0, this.hp / this.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(-18, -20, 36, 4);
      ctx.fillStyle = hpRatio > 0.3 ? '#00ff88' : '#ff0033';
      ctx.fillRect(-18, -20, 36 * hpRatio, 4);
    }

    ctx.restore();
  }
}
