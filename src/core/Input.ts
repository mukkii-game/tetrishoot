import { CANVAS_WIDTH } from '../config';

// ユーザー入力の管理（テトリス3ピース選択 [1][2][3]/Tab、移動、回転、上下左右）
//
// ★ 2026-09 大改修（スマホ対応 & PC操作変更）
//   1) ポインタ操作を Touch Events から **Pointer Events** に全面移行した。
//      旧実装は「最初に触れた指の identifier を activeTouchId に保持し、
//       touchend が来るまで新しい指を一切受け付けない」構造だった。
//      iOS Safari の **クロスオリジン iframe（itch.io の html-classic.itch.zone 埋め込み）** では、
//      親ページ側にジェスチャーを奪われると touchend / touchcancel が
//      iframe 内のドキュメントへ配送されないことがある。
//      すると activeTouchId が永久に残り、以降 touchstart も mousedown も
//      すべて `if (this.activeTouchId !== null) return;` で弾かれ、
//      「タイトルは表示されるがタップしても一切反応しない」＝完全な入力デッドロックになる。
//      （同じ端末でも GitHub Pages のトップレベル表示では親ページが無いため再現しない）
//      → 新実装は pointerId をキーにした Map で管理し、
//        「古い状態が新しい入力をブロックする」経路を根絶。
//        さらに setPointerCapture / pointercancel / lostpointercapture / blur /
//        visibilitychange の全経路で確実に解放する。
//      （itch.io 上で正常動作している別作品 weed も Pointer Events 方式）
//   2) スマホ操作を左右ゾーン分割に変更（bolero_ball 方式）。
//      画面左半分＝自機移動の仮想スティック（弾は出ない）。
//      キー移動と同じ速度で、8方向ではなく全方向（360度）へ動く。
//      画面右半分＝タップ／押しっぱなしでショット。
//   3) PC ではマウス移動で自機を動かさない（移動はキーボードのみ）。
//      マウス座標はメニューのホバー／クリック判定用に引き続き保持する。

type PointerRole = 'STICK' | 'FIRE';

interface TrackedPointer {
  role: PointerRole;
  originX: number; // 仮想スティックの支点（キャンバス座標）
  originY: number;
  lastMoveAt: number; // 最後に動いた時刻（ms）。取りこぼし検知用
  stale: boolean; // 解放イベントを取りこぼした疑いあり（入力として無効扱い）
}

export class Input {
  public left = false;
  public right = false;
  public up = false;
  public down = false;
  public shoot = false;
  public mutePressed = false;
  public escape = false;
  public justEscape = false;

  // 単発押し判定
  public justLeft = false;
  public justRight = false;
  public justRotate = false;
  public justDrop = false;
  public justShoot = false;
  public justTab = false;
  public enter = false;
  public justEnter = false;
  public justInvincible = false;
  public selectedPieceIndex: number | null = null;

  public mouseX: number | null = null;
  public mouseY: number | null = null;
  public isMouseDown = false;
  public justMouseDown = false;

  // ★ スマホ左半分の仮想スティック出力（-1..1、合成長は最大1）
  public moveVecX = 0;
  public moveVecY = 0;
  // 仮想スティックの描画用状態（GameManager がHUDに描く）
  public stickActive = false;
  public stickOriginX = 0;
  public stickOriginY = 0;
  public stickKnobX = 0;
  public stickKnobY = 0;

  // ★ 端末側デバッグ用：実際に届いたイベントの回数と直近の種類。
  //   スマホには開発者コンソールが無いので、タイトル画面に小さく出して
  //   「タップがそもそも届いていないのか／届いているのに動かないのか」を切り分ける。
  public evtDown = 0;
  public evtMove = 0;
  public evtUp = 0;
  public evtCancel = 0;
  public evtTouch = 0;
  public evtClick = 0;
  public lastEventLabel = '-';
  public srcTag = '-'; // 直近の入力経路（T=TouchEvents / P=PointerEvents(touch) / M=マウス）

  private lastPointerDownAt = -1e9; // DOMフォールバックの二重発火防止
  private touchEventsSeen = false; // 一度でも touchstart が来たら、タッチは Touch Events を正とする

  private static readonly STICK_DEAD_ZONE = 8; // この振れ幅までは静止
  private static readonly STICK_MAX_RADIUS = 46; // ここで最大速度（＝キー入力と同速）
  // ★ 最終防衛線：pointerup も touchend も届かなかった指を「無効」にするまでの時間（ms）。
  //   指を表から消すのではなく stale フラグを立てるだけなので、
  //   もし誤検知でも指を1pxでも動かせば（pointermove が来れば）その瞬間に操作が復帰する。
  private static readonly POINTER_WATCHDOG_MS = 6000;

  private canvas: HTMLCanvasElement;
  private pointers = new Map<number, TrackedPointer>();
  private keyShoot = false; // スペースキー
  private pointerShoot = false; // 右半分タップ or PCクリック

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.setupListeners();
  }

  // ==========================================
  // 座標変換
  // ==========================================
  private toCanvas(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left) * (this.canvas.width / rect.width),
      y: (clientY - rect.top) * (this.canvas.height / rect.height),
    };
  }

  // ==========================================
  // ショット状態の同期（キーボードとポインタの論理和）
  // ==========================================
  private syncShoot(): void {
    const on = this.keyShoot || this.pointerShoot;
    if (on && !this.shoot) this.justShoot = true;
    this.shoot = on;
    this.isMouseDown = this.pointerShoot;
  }

  private isFiringNow(): boolean {
    for (const p of this.pointers.values()) {
      if (p.role === 'FIRE' && !p.stale) return true;
    }
    return false;
  }

  private refreshPointerShoot(): void {
    this.pointerShoot = this.isFiringNow();
    this.syncShoot();
  }

  // ==========================================
  // ポインタ共通処理
  // ==========================================
  private onPointerDown(id: number, clientX: number, clientY: number, isTouch: boolean): void {
    if (this.pointers.has(id)) return; // 同一IDの二重登録を防止（window/canvas 両取り対策）

    this.evtDown++;
    this.lastPointerDownAt = performance.now();
    const p = this.toCanvas(clientX, clientY);
    this.lastEventLabel = `${this.srcTag}dn ${Math.round(p.x)},${Math.round(p.y)}`;
    this.mouseX = p.x;
    this.mouseY = p.y;
    this.justMouseDown = true; // メニューのタップ判定は左右どちらのゾーンでも有効

    if (isTouch && p.x < CANVAS_WIDTH / 2) {
      // ★ 左半分：自機移動の仮想スティック。弾は撃たない
      // 取りこぼしで残った古いスティック指があれば破棄して常に最新の指を優先する
      for (const [pid, tp] of this.pointers) {
        if (tp.role === 'STICK') this.pointers.delete(pid);
      }
      this.pointers.set(id, { role: 'STICK', originX: p.x, originY: p.y, lastMoveAt: performance.now(), stale: false });
      this.moveVecX = 0;
      this.moveVecY = 0;
      this.stickActive = true;
      this.stickOriginX = p.x;
      this.stickOriginY = p.y;
      this.stickKnobX = p.x;
      this.stickKnobY = p.y;
      return;
    }

    // 右半分タップ（スマホ）／PCのクリック：ショット
    this.pointers.set(id, { role: 'FIRE', originX: p.x, originY: p.y, lastMoveAt: performance.now(), stale: false });
    this.refreshPointerShoot();
  }

  private onPointerMove(id: number, clientX: number, clientY: number, isTouch: boolean): void {
    const tp = this.pointers.get(id);

    if (!isTouch) {
      // PC：カーソル座標はメニューのホバー判定に使うだけ。自機は動かさない
      const p = this.toCanvas(clientX, clientY);
      this.mouseX = p.x;
      this.mouseY = p.y;
      return;
    }

    if (!tp) return;
    this.evtMove++;
    tp.lastMoveAt = performance.now();
    tp.stale = false; // 動いた＝指はまだ画面上にある
    const p = this.toCanvas(clientX, clientY);

    if (tp.role !== 'STICK') {
      this.mouseX = p.x;
      this.mouseY = p.y;
      return;
    }

    let dx = p.x - tp.originX;
    let dy = p.y - tp.originY;
    const dist = Math.hypot(dx, dy);

    // フローティングスティック：最大振れ幅を超えたら支点を追従させる
    // （指を戻したときに即座に減速でき、端まで引っ張っても操作が破綻しない）
    if (dist > Input.STICK_MAX_RADIUS) {
      const k = (dist - Input.STICK_MAX_RADIUS) / dist;
      tp.originX += dx * k;
      tp.originY += dy * k;
      dx = p.x - tp.originX;
      dy = p.y - tp.originY;
    }

    const d = Math.hypot(dx, dy);
    if (d <= Input.STICK_DEAD_ZONE) {
      this.moveVecX = 0;
      this.moveVecY = 0;
    } else {
      const mag = Math.min(1, (d - Input.STICK_DEAD_ZONE) / (Input.STICK_MAX_RADIUS - Input.STICK_DEAD_ZONE));
      this.moveVecX = (dx / d) * mag;
      this.moveVecY = (dy / d) * mag;
    }

    this.stickActive = true;
    this.stickOriginX = tp.originX;
    this.stickOriginY = tp.originY;
    this.stickKnobX = tp.originX + dx;
    this.stickKnobY = tp.originY + dy;
  }

  private onPointerUp(id: number): void {
    const tp = this.pointers.get(id);
    if (!tp) return;
    this.evtUp++;
    this.lastEventLabel = 'up';
    this.pointers.delete(id);
    if (tp.role === 'STICK') {
      this.moveVecX = 0;
      this.moveVecY = 0;
      this.stickActive = false;
    }
    this.refreshPointerShoot();
  }

  /**
   * ★ 最終防衛線：解放イベントを完全に取りこぼした指を毎フレーム掃除する。
   *   （iOS Safari のクロスオリジン iframe では、親ページにジェスチャーを奪われると
   *     touchend / pointerup が iframe 側へ届かないことがある）
   *   ついでに stickActive をポインタ表から作り直し、表示だけ残る不整合も潰す。
   */
  private reapLostPointers(): void {
    const now = performance.now();
    let hasStick = false;
    for (const p of this.pointers.values()) {
      if (!p.stale && now - p.lastMoveAt > Input.POINTER_WATCHDOG_MS) p.stale = true;
      if (p.role === 'STICK' && !p.stale) hasStick = true;
    }
    if (!hasStick && (this.stickActive || this.moveVecX !== 0 || this.moveVecY !== 0)) {
      this.stickActive = false;
      this.moveVecX = 0;
      this.moveVecY = 0;
    }
    // ここでは「切る」方向にしか働かせない（押していない弾が勝手に出るのを防ぐ）
    if (this.pointerShoot && !this.isFiringNow()) {
      this.pointerShoot = false;
      this.syncShoot();
    }
  }

  /** 画面が隠れた・フォーカスを失った等、確実に全指を離す */
  private releaseAllPointers(): void {
    this.pointers.clear();
    this.moveVecX = 0;
    this.moveVecY = 0;
    this.stickActive = false;
    this.pointerShoot = false;
    this.syncShoot();
  }

  private setupListeners(): void {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Escape'].includes(e.code)) {
        e.preventDefault();
      }

      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          if (!this.left) this.justLeft = true;
          this.left = true;
          break;
        case 'ArrowRight':
        case 'KeyD':
          if (!this.right) this.justRight = true;
          this.right = true;
          break;
        case 'ArrowUp':
        case 'KeyW':
          if (!this.up) this.justRotate = true;
          this.up = true;
          break;
        case 'ArrowDown':
        case 'KeyS':
          if (!this.down) this.justDrop = true;
          this.down = true;
          break;
        case 'Space':
          this.keyShoot = true;
          this.syncShoot();
          break;
        case 'Enter':
        case 'NumpadEnter':
          if (!this.enter) this.justEnter = true;
          this.enter = true;
          break;
        case 'Tab':
          this.justTab = true;
          break;
        case 'Digit1':
        case 'Numpad1':
          this.selectedPieceIndex = 0;
          break;
        case 'Digit2':
        case 'Numpad2':
          this.selectedPieceIndex = 1;
          break;
        case 'Digit3':
        case 'Numpad3':
          this.selectedPieceIndex = 2;
          break;
        case 'KeyM':
          this.mutePressed = true;
          break;
        case 'KeyI':
        case 'KeyG':
          this.justInvincible = true;
          break;
        case 'Escape':
          if (!this.escape) this.justEscape = true;
          this.escape = true;
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          this.left = false;
          break;
        case 'ArrowRight':
        case 'KeyD':
          this.right = false;
          break;
        case 'ArrowUp':
        case 'KeyW':
          this.up = false;
          break;
        case 'ArrowDown':
        case 'KeyS':
          this.down = false;
          break;
        case 'Space':
          this.keyShoot = false;
          this.syncShoot();
          break;
        case 'Enter':
        case 'NumpadEnter':
          this.enter = false;
          break;
        case 'Escape':
          this.escape = false;
          break;
      }
    });

    // フル画面ボタン（DOM要素）のタップはゲーム入力として扱わない
    const isUiTarget = (target: EventTarget | null): boolean => {
      const el = target as Element | null;
      return !!(el && typeof el.closest === 'function' && el.closest('#fullscreen-btn'));
    };
    // ★ ここだけは touchstart の既定動作を止めない。
    //   iOS は touchstart を preventDefault するとネイティブ click を発火しなくなるため、
    //   止めてしまうと「タイトル画面の透明ボタン」という最後の保険が効かなくなる。
    //   （スクロール抑止は CSS の touch-action:none 側で担保する）
    const keepsNativeClick = (target: EventTarget | null): boolean => {
      const el = target as Element | null;
      return !!(el && typeof el.closest === 'function' && el.closest('#title-tap-layer'));
    };

    // ※ `'PointerEvent' in window` と書くと TS が else 側の window を never に絞ってしまうため
    //    typeof で判定する
    const hasPointerEvents = typeof (window as unknown as { PointerEvent?: unknown }).PointerEvent !== 'undefined';

    // ==========================================================
    // ★ タッチ入力は Touch Events を「主系統」にする（2026-09 再修正）
    //
    //   Pointer Events 一本にしたところ、iOS + itch.io（クロスオリジン iframe）で
    //   「タイトルのタップは効くのに、ゲーム中の移動もショットも効かない」という報告。
    //   これは WebKit がスクロールし得る親ページを持つ iframe で
    //   pointerdown の直後に pointercancel を投げてくる挙動と完全に一致する：
    //     ・タイトル＝ justMouseDown が1回立てば始まるので「効く」
    //     ・移動＝ pointermove が来ないのでスティックが倒れず「効かない」
    //     ・ショット＝ pointerdown で立てた shoot が同じフレーム内の
    //       pointercancel で降ろされるので「効かない」
    //   Touch Events は preventDefault さえしていれば touchmove / touchend が
    //   確実に届くので、タッチはこちらを正とする。
    //   Pointer Events はマウス用に残し、タッチについては
    //   「まだ一度も touchstart を受けていない環境」でだけ働かせる。
    // ==========================================================
    const TOUCH_ID_BASE = 100000; // Touch.identifier と pointerId の衝突を避ける

    const touchDown = (e: TouchEvent) => {
      this.evtTouch++;
      if (isUiTarget(e.target)) return;
      // タイトルの透明ボタン上だけは既定動作を残す（iOS はここで止めると click が出ない）
      if (!keepsNativeClick(e.target) && e.cancelable) e.preventDefault();
      this.touchEventsSeen = true;
      this.srcTag = 'T';
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        this.onPointerDown(TOUCH_ID_BASE + t.identifier, t.clientX, t.clientY, true);
      }
    };

    const touchMove = (e: TouchEvent) => {
      if (isUiTarget(e.target)) return;
      if (e.cancelable) e.preventDefault(); // これが無いと iOS はスクロールに持っていってしまう
      this.srcTag = 'T';
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        this.onPointerMove(TOUCH_ID_BASE + t.identifier, t.clientX, t.clientY, true);
      }
    };

    const touchEnd = (e: TouchEvent) => {
      if (!isUiTarget(e.target) && !keepsNativeClick(e.target) && e.cancelable) e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        this.onPointerUp(TOUCH_ID_BASE + e.changedTouches[i].identifier);
      }
      // 画面上に指が1本も残っていない＝取りこぼした指があっても、ここで確実に全解放できる
      if (e.touches.length === 0) this.releaseAllPointers();
    };

    window.addEventListener('touchstart', touchDown, { passive: false });
    window.addEventListener('touchmove', touchMove, { passive: false });
    window.addEventListener('touchend', touchEnd, { passive: false });
    window.addEventListener('touchcancel', touchEnd, { passive: false });

    if (hasPointerEvents) {
      // ★ pointerdown は window で受ける。
      //   キャンバスの上に何かが覆いかぶさっていても（デバッグ用エラーバー等）
      //   入力が死なないようにするための保険。
      window.addEventListener('pointerdown', (e) => {
        if (isUiTarget(e.target)) return;
        const isTouch = e.pointerType !== 'mouse';
        if (isTouch && this.touchEventsSeen) return; // タッチは Touch Events 側の担当
        // マウスだけキャプチャする。ウィンドウ外までドラッグしても pointerup を確実に受け取るため。
        if (!isTouch) {
          try {
            this.canvas.setPointerCapture(e.pointerId);
          } catch {
            /* キャプチャできない環境は無視（イベントは window でも拾える） */
          }
        }
        this.srcTag = isTouch ? 'P' : 'M';
        this.onPointerDown(e.pointerId, e.clientX, e.clientY, isTouch);
      });

      window.addEventListener('pointermove', (e) => {
        const isTouch = e.pointerType !== 'mouse';
        if (isTouch && this.touchEventsSeen) return;
        this.srcTag = isTouch ? 'P' : 'M';
        this.onPointerMove(e.pointerId, e.clientX, e.clientY, isTouch);
      });

      // up / cancel は常に処理する（未追跡IDなら何もしないので害が無く、
      // 主系統が切り替わる前に登録された指も確実に解放できる）
      window.addEventListener('pointerup', (e) => this.onPointerUp(e.pointerId));
      window.addEventListener('pointercancel', (e) => {
        this.evtCancel++;
        this.lastEventLabel = 'cancel';
        this.onPointerUp(e.pointerId);
      });
      // キャプチャを張った本人（キャンバス）が手放した時だけ解放扱いにする
      window.addEventListener('lostpointercapture', (e) => {
        if (e.target === this.canvas) this.onPointerUp(e.pointerId);
      });
    } else {
      // Pointer Events 非対応の古い環境向け：マウスのフォールバック
      window.addEventListener('mousedown', (e) => {
        if (isUiTarget(e.target) || e.button !== 0) return;
        this.srcTag = 'M';
        this.onPointerDown(-1, e.clientX, e.clientY, false);
      });
      window.addEventListener('mousemove', (e) => this.onPointerMove(-1, e.clientX, e.clientY, false));
      window.addEventListener('mouseup', (e) => {
        if (e.button === 0) this.onPointerUp(-1);
      });
    }

    // 取りこぼし対策：フォーカス喪失・非表示化・ページ離脱では必ず全解放する
    window.addEventListener('blur', () => this.releaseAllPointers());
    window.addEventListener('pagehide', () => this.releaseAllPointers());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAllPointers();
    });
  }

  /**
   * ★ 最後の砦：DOM の透明ボタンから届いた「本物の click」をゲームのタップとして流し込む。
   *   iOS Safari では <button> のネイティブ click がもっとも確実に届く経路なので、
   *   万一 Pointer / Touch が一切届かない環境でも、タイトル画面だけは必ず操作できるようにする。
   *   直前に pointerdown を受けている時は二重入力になるので無視する。
   */
  public injectTap(clientX: number, clientY: number): void {
    this.evtClick++;
    if (performance.now() - this.lastPointerDownAt < 700) return; // 通常経路が生きているので不要
    const p = this.toCanvas(clientX, clientY);
    this.mouseX = p.x;
    this.mouseY = p.y;
    this.justMouseDown = true;
    this.lastEventLabel = `click ${Math.round(p.x)},${Math.round(p.y)}`;
  }

  /** デバッグ表示用：キャンバスの実表示サイズ（0 なら座標変換が壊れている＝操作不能の原因） */
  public canvasRectLabel(): string {
    const r = this.canvas.getBoundingClientRect();
    return `${Math.round(r.width)}x${Math.round(r.height)}`;
  }

  public clearTransientInputs(): void {
    this.keyShoot = false;
    this.pointerShoot = false;
    this.shoot = false;
    this.isMouseDown = false;
    this.justShoot = false;
    this.justMouseDown = false;
    this.justEnter = false;
    this.justInvincible = false;
    this.justRotate = false;
    this.justDrop = false;
    this.justLeft = false;
    this.justRight = false;
    this.justEscape = false;
  }

  public resetPerFrame(): void {
    this.reapLostPointers();
    this.mutePressed = false;
    this.justEscape = false;
    this.justLeft = false;
    this.justRight = false;
    this.justRotate = false;
    this.justDrop = false;
    this.justShoot = false;
    this.justMouseDown = false;
    this.justTab = false;
    this.justEnter = false;
    this.justInvincible = false;
    this.selectedPieceIndex = null;
  }
}
