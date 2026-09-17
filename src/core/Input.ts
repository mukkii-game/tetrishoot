
// ユーザー入力の管理（ドッキングフェーズの3ピース選択 [1][2][3]/Tab、移動、回転、上下左右）
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
//   2) スマホ操作を左右ゾーン分割の仮想スティックに変更（bolero_ball 方式）。
//      → これは後述の「指一本」改修で置き換え済み（履歴として残す）。
//   3) PC ではマウス移動で自機を動かさない（移動はキーボードのみ）。
//      マウス座標はメニューのホバー／クリック判定用に引き続き保持する。

// ★ 2026-09 追加改修（スマホ操作を「指一本」へ）
//   ユーザー要望：「指一本で移動もショットも行う／ポインティング移動に変える／
//   ブロックパーツはショットでは回転もノックバックもしない／ブロックパーツ直接タッチで回転とノックバック」
//   → 左右ゾーン分割と仮想スティックは廃止。タッチは1系統（POINT）に統一し、
//     触れている間は「自機が動く」＋「撃ちっぱなし」になる。
//   ★ 2026-09 再修正（ユーザー要望）：移動は「指を置いた場所へ等速で寄っていく」絶対座標方式ではなく、
//     **指を動かした分だけ自機も動く相対方式（マウス／トラックパッドと同じ）** にした。
//     指の移動量をそのまま（1:1で）自機へ渡すので、移動速度＝指の速度になる。
//     ただし落下中のブロックパーツに触れたタップだけは touchTapFilter で横取りし、
//     自機を動かさず回転／ノックバックにだけ使う（role: 'CONSUMED'）。
type PointerRole = 'POINT' | 'FIRE' | 'CONSUMED';

interface TrackedPointer {
  role: PointerRole;
  originX: number; // タッチ開始位置（キャンバス座標）
  originY: number;
  lastX: number; // 直前フレームの指の位置。相対移動量の算出に使う
  lastY: number;
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

  // ★ スマホ：このフレームに指が動いた量（キャンバス座標）。自機はこの分だけ相対的に動く。
  //   毎フレーム resetPerFrame() で 0 に戻す（＝指を止めれば自機も止まる）。
  public moveDeltaX = 0;
  public moveDeltaY = 0;
  // 指が触れているか＆その位置（レティクル表示と、指が居るかの判定に使う）
  public touchPointActive = false;
  public touchPointX = 0;
  public touchPointY = 0;
  /** 一度でもタッチ入力が来たか（＝スマホ操作系に切り替える判定） */
  public touchMode = false;
  /**
   * ★ タッチ開始位置を先に GameManager へ渡し、true が返ったらそのタップは
   *   「落下ブロックパーツへの直接タッチ（回転＋ノックバック）」として消費する。
   *   消費されたタップは自機を動かさず、弾も撃たない。
   */
  public touchTapFilter: ((x: number, y: number) => boolean) | null = null;

  // 指位置レティクルの描画用状態（GameManager がHUDに描く）
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

  // ★ 「ネイティブ click しか届かない環境」用の受け渡し。
  //   Facebook / X / LINE などのアプリ内ブラウザ（iOS WebView）では、
  //   実測で touchstart も pointerdown も一切届かず、<button> の click だけが届く。
  //   その場合でも最低限遊べるよう、クリック位置をゲーム側へ渡す。
  public pendingClickX: number | null = null;
  public pendingClickY: number | null = null;

  private lastPointerDownAt = -1e9; // DOMフォールバックの二重発火防止
  private touchEventsSeen = false; // 一度でも touchstart が来たら、タッチは Touch Events を正とする

  // ★ 最終防衛線：pointerup も touchend も届かなかった指を「無効」にするまでの時間（ms）。
  //   指を表から消すのではなく stale フラグを立てるだけなので、
  //   もし誤検知でも指を1pxでも動かせば（pointermove が来れば）その瞬間に操作が復帰する。
  private static readonly POINTER_WATCHDOG_MS = 6000;

  private canvas: HTMLCanvasElement;
  private pointers = new Map<number, TrackedPointer>();
  private keyShoot = false; // スペース／Enterキー

  // ★ ユーザー要望：テンキーでも移動できるように。
  //   4/8/2/6 で上下左右、7/9/1/3 で斜め、さらに 4+8 のような同時押しでも斜めになる。
  //   矢印／WASD とテンキーは独立に持ち、public な left/right/up/down はその論理和にする
  //   （片方を離してももう片方が押されていれば動き続ける）。
  private arrowDirs = { left: false, right: false, up: false, down: false };
  private padKeys = new Set<string>();
  // テンキーの各キーが表す方向（5 は「停止」なので何も割り当てない）
  private static readonly NUMPAD_DIRS: Record<string, { left?: boolean; right?: boolean; up?: boolean; down?: boolean }> = {
    Numpad8: { up: true },
    Numpad2: { down: true },
    Numpad4: { left: true },
    Numpad6: { right: true },
    Numpad7: { up: true, left: true },
    Numpad9: { up: true, right: true },
    Numpad1: { down: true, left: true },
    Numpad3: { down: true, right: true },
  };
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
    let left = rect.left;
    let top = rect.top;
    let width = rect.width;
    let height = rect.height;
    if (width <= 0 || height <= 0) {
      // ★ 何らかの理由でレイアウトが壊れてキャンバスの実寸が取れない場合でも、
      //   左右ゾーン判定だけは成立するようビューポート基準にフォールバックする。
      //   （0 を返すと全タッチが左半分＝移動扱いになり「弾が出ない」状態になるため）
      left = 0;
      top = 0;
      width = window.innerWidth || this.canvas.width;
      height = window.innerHeight || this.canvas.height;
    }
    return {
      x: (clientX - left) * (this.canvas.width / width),
      y: (clientY - top) * (this.canvas.height / height),
    };
  }

  // ==========================================
  // ショット状態の同期（キーボードとポインタの論理和）
  // ==========================================
  /**
   * ★ 矢印／WASD とテンキーの押下状態から、公開する left/right/up/down を作り直す。
   *   同時押しはそのまま論理和になるので、4+8 のような組み合わせ斜めも成立する。
   *   単発押し判定（justLeft など）は、合成後の値が false→true になった瞬間に立てる。
   */
  private syncDirections(): void {
    const next = { ...this.arrowDirs };
    for (const code of this.padKeys) {
      const d = Input.NUMPAD_DIRS[code];
      if (!d) continue;
      if (d.left) next.left = true;
      if (d.right) next.right = true;
      if (d.up) next.up = true;
      if (d.down) next.down = true;
    }
    if (next.left && !this.left) this.justLeft = true;
    if (next.right && !this.right) this.justRight = true;
    if (next.up && !this.up) this.justRotate = true;
    if (next.down && !this.down) this.justDrop = true;
    this.left = next.left;
    this.right = next.right;
    this.up = next.up;
    this.down = next.down;
  }

  private syncShoot(): void {
    const on = this.keyShoot || this.pointerShoot;
    if (on && !this.shoot) this.justShoot = true;
    this.shoot = on;
    this.isMouseDown = this.pointerShoot;
  }

  private isFiringNow(): boolean {
    for (const p of this.pointers.values()) {
      if ((p.role === 'FIRE' || p.role === 'POINT') && !p.stale) return true;
    }
    return false;
  }

  /** ポインタ表から、ポインティング移動の目標座標を作り直す（表示だけ残る不整合を潰す） */
  private refreshTouchPoint(): void {
    for (const p of this.pointers.values()) {
      if (p.role === 'POINT' && !p.stale) return; // 有効な指があるので現状維持
    }
    this.touchPointActive = false;
    this.stickActive = false;
  }

  /** 指の現在位置を記録する（移動量そのものは onPointerMove で積む） */
  private setTouchPoint(x: number, y: number): void {
    this.touchPointActive = true;
    this.touchPointX = x;
    this.touchPointY = y;
    // レティクル表示（指の位置に照準リングを出すだけ。操作量には使わない）
    this.stickActive = true;
    this.stickOriginX = x;
    this.stickOriginY = y;
    this.stickKnobX = x;
    this.stickKnobY = y;
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

    this.lastPointerDownAt = performance.now();
    const p = this.toCanvas(clientX, clientY);
    this.lastEventLabel = `${this.srcTag}dn ${Math.round(p.x)},${Math.round(p.y)}`;
    this.mouseX = p.x;
    this.mouseY = p.y;
    this.justMouseDown = true; // メニューのタップ判定は左右どちらのゾーンでも有効

    if (isTouch) {
      this.touchMode = true;

      // ★ 落下ブロックパーツへの直接タッチは回転／ノックバック専用。自機は動かさず弾も撃たない
      if (this.touchTapFilter && this.touchTapFilter(p.x, p.y)) {
        this.pointers.set(id, { role: 'CONSUMED', originX: p.x, originY: p.y, lastX: p.x, lastY: p.y, lastMoveAt: performance.now(), stale: false });
        return;
      }

      // ★ 指一本で移動＋ショット。取りこぼしで残った古い指は破棄して常に最新を優先する
      for (const [pid, tp] of this.pointers) {
        if (tp.role === 'POINT') this.pointers.delete(pid);
      }
      // ★ 相対移動：触れた瞬間は動かさない。ここからの移動量だけを自機へ渡す
      this.pointers.set(id, { role: 'POINT', originX: p.x, originY: p.y, lastX: p.x, lastY: p.y, lastMoveAt: performance.now(), stale: false });
      this.setTouchPoint(p.x, p.y);
      this.refreshPointerShoot();
      return;
    }

    // PCのクリック：ショット
    this.pointers.set(id, { role: 'FIRE', originX: p.x, originY: p.y, lastX: p.x, lastY: p.y, lastMoveAt: performance.now(), stale: false });
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
    tp.lastMoveAt = performance.now();
    tp.stale = false; // 動いた＝指はまだ画面上にある
    const p = this.toCanvas(clientX, clientY);

    this.mouseX = p.x;
    this.mouseY = p.y;

    // ★ 相対移動：指が動いた分だけ自機も動く（マウス／トラックパッドと同じ）。
    //   1:1 で渡すので、自機の移動速度はそのまま指の移動速度になる。
    if (tp.role === 'POINT') {
      this.moveDeltaX += p.x - tp.lastX;
      this.moveDeltaY += p.y - tp.lastY;
      this.setTouchPoint(p.x, p.y);
    }
    tp.lastX = p.x;
    tp.lastY = p.y;
  }

  private onPointerUp(id: number): void {
    const tp = this.pointers.get(id);
    if (!tp) return;
    this.lastEventLabel = 'up';
    this.pointers.delete(id);
    this.refreshTouchPoint();
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
    for (const p of this.pointers.values()) {
      if (!p.stale && now - p.lastMoveAt > Input.POINTER_WATCHDOG_MS) p.stale = true;
    }
    this.refreshTouchPoint();
    // ここでは「切る」方向にしか働かせない（押していない弾が勝手に出るのを防ぐ）
    if (this.pointerShoot && !this.isFiringNow()) {
      this.pointerShoot = false;
      this.syncShoot();
    }
  }

  /** 画面が隠れた・フォーカスを失った等、確実に全指を離す */
  private releaseAllPointers(): void {
    // キーボードも一緒に解放する（フォーカスを失うと keyup が届かず押しっぱなしになるため）
    this.padKeys.clear();
    this.arrowDirs = { left: false, right: false, up: false, down: false };
    this.syncDirections();
    this.keyShoot = false;
    this.pointers.clear();
    this.moveDeltaX = 0;
    this.moveDeltaY = 0;
    this.touchPointActive = false;
    this.stickActive = false;
    this.pointerShoot = false;
    this.syncShoot();
  }

  private setupListeners(): void {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Escape'].includes(e.code)) {
        e.preventDefault();
      }

      // テンキーの方向キー（4826 / 7913）。同時押しでの斜めも成立させる
      if (Input.NUMPAD_DIRS[e.code]) {
        e.preventDefault();
        this.padKeys.add(e.code);
        this.syncDirections();
        return;
      }
      if (e.code === 'Numpad5') {
        // 5 は「停止」。押した瞬間にテンキー分の入力を全部落とす
        e.preventDefault();
        this.padKeys.clear();
        this.syncDirections();
        return;
      }

      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          this.arrowDirs.left = true;
          this.syncDirections();
          break;
        case 'ArrowRight':
        case 'KeyD':
          this.arrowDirs.right = true;
          this.syncDirections();
          break;
        case 'ArrowUp':
        case 'KeyW':
          this.arrowDirs.up = true;
          this.syncDirections();
          break;
        case 'ArrowDown':
        case 'KeyS':
          this.arrowDirs.down = true;
          this.syncDirections();
          break;
        case 'Space':
          this.keyShoot = true;
          this.syncShoot();
          break;
        // ★ ユーザー要望：スペースだけでなく Enter でも弾が出る（メニュー確定も従来どおり）
        case 'Enter':
        case 'NumpadEnter':
          if (!this.enter) this.justEnter = true;
          this.enter = true;
          this.keyShoot = true;
          this.syncShoot();
          break;
        case 'Tab':
          this.justTab = true;
          break;
        // ★ テンキーの 1/2/3 は移動に使うようになったので、ブロック選択は数字列のみ
        case 'Digit1':
          this.selectedPieceIndex = 0;
          break;
        case 'Digit2':
          this.selectedPieceIndex = 1;
          break;
        case 'Digit3':
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
      if (Input.NUMPAD_DIRS[e.code]) {
        this.padKeys.delete(e.code);
        this.syncDirections();
        return;
      }

      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          this.arrowDirs.left = false;
          this.syncDirections();
          break;
        case 'ArrowRight':
        case 'KeyD':
          this.arrowDirs.right = false;
          this.syncDirections();
          break;
        case 'ArrowUp':
        case 'KeyW':
          this.arrowDirs.up = false;
          this.syncDirections();
          break;
        case 'ArrowDown':
        case 'KeyS':
          this.arrowDirs.down = false;
          this.syncDirections();
          break;
        case 'Space':
          this.keyShoot = false;
          this.syncShoot();
          break;
        case 'Enter':
        case 'NumpadEnter':
          this.enter = false;
          this.keyShoot = false;
          this.syncShoot();
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
    //   なお全ての入力リスナーは capture フェーズで登録する。
    //   バブリング前に横取りされても（誰かが stopPropagation しても）必ず先に届くため。
    const TOUCH_ID_BASE = 100000; // Touch.identifier と pointerId の衝突を避ける

    // ★ 同じイベントを複数の登録先で二重処理しないための印。
    //   最初に届いた登録先だけが処理し、残りは素通りする。
    const alreadyHandled = (e: Event): boolean => {
      const ev = e as Event & { __gxSeen?: boolean };
      if (ev.__gxSeen) return true;
      ev.__gxSeen = true;
      return false;
    };

    const makeTouchDown = (tag: string) => (e: TouchEvent) => {
      if (alreadyHandled(e)) return;
      this.evtTouch++; // 生イベント数（フィルタ前）
      if (isUiTarget(e.target)) return;
      // タイトルの透明ボタン上だけは既定動作を残す（iOS はここで止めると click が出ない）
      if (!keepsNativeClick(e.target) && e.cancelable) e.preventDefault();
      this.touchEventsSeen = true;
      this.srcTag = 'T' + tag;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        this.onPointerDown(TOUCH_ID_BASE + t.identifier, t.clientX, t.clientY, true);
      }
    };

    const makeTouchMove = (tag: string) => (e: TouchEvent) => {
      if (alreadyHandled(e)) return;
      this.evtMove++;
      if (isUiTarget(e.target)) return;
      if (e.cancelable) e.preventDefault(); // これが無いと iOS はスクロールに持っていってしまう
      this.srcTag = 'T' + tag;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        this.onPointerMove(TOUCH_ID_BASE + t.identifier, t.clientX, t.clientY, true);
      }
    };

    const makeTouchEnd = () => (e: TouchEvent) => {
      if (alreadyHandled(e)) return;
      if (e.type === 'touchcancel') this.evtCancel++; else this.evtUp++;
      if (!isUiTarget(e.target) && !keepsNativeClick(e.target) && e.cancelable) e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        this.onPointerUp(TOUCH_ID_BASE + e.changedTouches[i].identifier);
      }
      // 画面上に指が1本も残っていない＝取りこぼした指があっても、ここで確実に全解放できる
      if (e.touches.length === 0) this.releaseAllPointers();
    };

    const makePointerDown = (tag: string) => (e: PointerEvent) => {
      if (alreadyHandled(e)) return;
      this.evtDown++; // 生イベント数（フィルタ前）
      if (isUiTarget(e.target)) return;
      const isTouch = e.pointerType !== 'mouse';
      if (isTouch && this.touchEventsSeen) return; // タッチは Touch Events 側の担当
      if (!isTouch) {
        try {
          this.canvas.setPointerCapture(e.pointerId);
        } catch {
          /* キャプチャできない環境は無視 */
        }
      }
      this.srcTag = (isTouch ? 'P' : 'M') + tag;
      this.onPointerDown(e.pointerId, e.clientX, e.clientY, isTouch);
    };

    const makePointerMove = (tag: string) => (e: PointerEvent) => {
      if (alreadyHandled(e)) return;
      const isTouch = e.pointerType !== 'mouse';
      if (isTouch && this.touchEventsSeen) return;
      this.evtMove++;
      this.srcTag = (isTouch ? 'P' : 'M') + tag;
      this.onPointerMove(e.pointerId, e.clientX, e.clientY, isTouch);
    };

    const makePointerUp = () => (e: PointerEvent) => {
      if (alreadyHandled(e)) return;
      if (!(e.pointerType !== 'mouse' && this.touchEventsSeen)) this.evtUp++;
      this.onPointerUp(e.pointerId);
    };

    const makePointerCancel = () => (e: PointerEvent) => {
      if (alreadyHandled(e)) return;
      this.evtCancel++;
      this.lastEventLabel = 'cancel';
      this.onPointerUp(e.pointerId);
    };

    // ★★ 登録先を canvas / document / window の3系統に増やす ★★
    //   実機（itch.io の埋め込み + iPhone）では window に付けたリスナーが
    //   capture フェーズでも一切発火しなかった（計測値 D0 M0 U0 X0 T0）。
    //   一方、同じ端末・同じ埋め込みで動いている別作品 weed は
    //   リスナーを canvas 要素に直接付けている。
    //   どこか1つでも届けば操作できるよう、要素・document・window の順に登録し、
    //   最初に受け取った系統だけが処理する（alreadyHandled で二重処理を防ぐ）。
    //   tag は「どの系統で届いたか」をデバッグ表示するためのもの（c/d/w）。
    //   キャンバス自身だけだと、タイトル中は透明タップ層が上に乗っていて
    //   イベントの target がそちらになるため拾えない。
    //   そこで両方の先祖である #game-container や body / html も登録先に含める。
    const container = this.canvas.parentElement;
    const targets: { t: EventTarget | null; tag: string }[] = [
      { t: this.canvas, tag: 'c' },
      { t: container, tag: 'g' },
      { t: document.body, tag: 'b' },
      { t: document.documentElement, tag: 'h' },
      { t: document, tag: 'd' },
      { t: window, tag: 'w' },
    ];

    for (const { t, tag } of targets) {
      if (!t) continue;
      t.addEventListener('touchstart', makeTouchDown(tag) as EventListener, { passive: false, capture: true });
      t.addEventListener('touchmove', makeTouchMove(tag) as EventListener, { passive: false, capture: true });
      t.addEventListener('touchend', makeTouchEnd() as EventListener, { passive: false, capture: true });
      t.addEventListener('touchcancel', makeTouchEnd() as EventListener, { passive: false, capture: true });

      if (hasPointerEvents) {
        t.addEventListener('pointerdown', makePointerDown(tag) as EventListener, { capture: true });
        t.addEventListener('pointermove', makePointerMove(tag) as EventListener, { capture: true });
        t.addEventListener('pointerup', makePointerUp() as EventListener, { capture: true });
        t.addEventListener('pointercancel', makePointerCancel() as EventListener, { capture: true });
      } else {
        t.addEventListener('mousedown', ((e: MouseEvent) => {
          if (alreadyHandled(e)) return;
          if (isUiTarget(e.target) || e.button !== 0) return;
          this.srcTag = 'M' + tag;
          this.onPointerDown(-1, e.clientX, e.clientY, false);
        }) as EventListener, { capture: true });
        t.addEventListener('mousemove', ((e: MouseEvent) => {
          if (alreadyHandled(e)) return;
          this.onPointerMove(-1, e.clientX, e.clientY, false);
        }) as EventListener, { capture: true });
        t.addEventListener('mouseup', ((e: MouseEvent) => {
          if (alreadyHandled(e)) return;
          if (e.button === 0) this.onPointerUp(-1);
        }) as EventListener, { capture: true });
      }
    }

    if (hasPointerEvents) {
      // キャプチャを張った本人（キャンバス）が手放した時だけ解放扱いにする
      window.addEventListener('lostpointercapture', (e) => {
        if (e.target === this.canvas) this.onPointerUp(e.pointerId);
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
    this.pendingClickX = p.x;
    this.pendingClickY = p.y;
    this.lastEventLabel = `click ${Math.round(p.x)},${Math.round(p.y)}`;
  }

  /**
   * ★ タッチもポインタも一切届かず、ネイティブ click だけが届く環境か。
   *   （アプリ内ブラウザで実際に起きる。通常のスマホ／PCでは最初の操作で
   *     evtTouch か evtDown が必ず増えるので、この判定は成立しない）
   */
  public isClickOnlyEnvironment(): boolean {
    return this.evtClick > 0 && this.evtTouch === 0 && this.evtDown === 0;
  }

  /** デバッグ表示用：キャンバスの実表示サイズ（0 なら座標変換が壊れている＝操作不能の原因） */
  public canvasRectLabel(): string {
    const r = this.canvas.getBoundingClientRect();
    return `${Math.round(r.width)}x${Math.round(r.height)}`;
  }

  public clearTransientInputs(): void {
    this.padKeys.clear();
    this.arrowDirs = { left: false, right: false, up: false, down: false };
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
    // ★ 相対移動量はそのフレームで消費しきる（指を止めれば自機も止まる）
    this.moveDeltaX = 0;
    this.moveDeltaY = 0;
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
