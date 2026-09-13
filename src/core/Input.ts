// ユーザー入力の管理（テトリス3ピース選択 [1][2][3]/Tab、移動、回転、上下左右）
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
  public selectedPieceIndex: number | null = null;

  public mouseX: number | null = null;
  public mouseY: number | null = null;
  public mouseDeltaX = 0;
  public mouseDeltaY = 0;
  public isMouseDown = false;
  public justMouseDown = false;
  public hasMouseMoved = false;

  private canvas: HTMLCanvasElement;
  private activeTouchId: number | null = null;
  private lastTouchClientX = 0;
  private lastTouchClientY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.setupListeners();
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
          this.hasMouseMoved = false;
          break;
        case 'ArrowRight':
        case 'KeyD':
          if (!this.right) this.justRight = true;
          this.right = true;
          this.hasMouseMoved = false;
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
          if (!this.shoot) this.justShoot = true;
          this.shoot = true;
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
          this.shoot = false;
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

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.activeTouchId !== null) return;

      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;

      const newMouseX = (e.clientX - rect.left) * scaleX;
      const newMouseY = (e.clientY - rect.top) * scaleY;

      // 前回の位置との差分ベクトルを累積（カーソルワープではなく、動かした方向・移動量だけ自機を動かす）
      if (this.mouseX !== null && this.mouseY !== null) {
        this.mouseDeltaX += newMouseX - this.mouseX;
        this.mouseDeltaY += newMouseY - this.mouseY;
      } else if (e.movementX !== undefined && e.movementY !== undefined) {
        this.mouseDeltaX += e.movementX * scaleX;
        this.mouseDeltaY += e.movementY * scaleY;
      }

      this.mouseX = newMouseX;
      this.mouseY = newMouseY;
      this.hasMouseMoved = true;
    });

    window.addEventListener('mousedown', (e) => {
      if (this.activeTouchId !== null) return;
      if (e.button === 0) {
        if (!this.isMouseDown) this.justMouseDown = true;
        this.isMouseDown = true;
        this.shoot = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (this.activeTouchId !== null) return;
      if (e.button === 0) {
        this.isMouseDown = false;
        this.shoot = false;
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      if (this.activeTouchId !== null) return;
      this.hasMouseMoved = false;
      this.mouseX = null;
      this.mouseY = null;
      this.mouseDeltaX = 0;
      this.mouseDeltaY = 0;
    });

    // ==========================================
    // スマートフォン向けタッチ操作（押し続けてドラッグで移動＆連射）
    // ==========================================
    window.addEventListener('touchstart', (e) => {
      if (this.activeTouchId === null && e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];
        this.activeTouchId = touch.identifier;
        this.lastTouchClientX = touch.clientX;
        this.lastTouchClientY = touch.clientY;

        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        this.mouseX = (touch.clientX - rect.left) * scaleX;
        this.mouseY = (touch.clientY - rect.top) * scaleY;

        if (!this.isMouseDown) this.justMouseDown = true;
        this.isMouseDown = true;
        if (!this.shoot) this.justShoot = true;
        this.shoot = true;
        this.hasMouseMoved = true;
      }
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (this.activeTouchId === null) return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.activeTouchId) {
          e.preventDefault();

          const rect = this.canvas.getBoundingClientRect();
          const scaleX = this.canvas.width / rect.width;
          const scaleY = this.canvas.height / rect.height;

          const deltaClientX = touch.clientX - this.lastTouchClientX;
          const deltaClientY = touch.clientY - this.lastTouchClientY;
          this.lastTouchClientX = touch.clientX;
          this.lastTouchClientY = touch.clientY;

          this.mouseDeltaX += deltaClientX * scaleX;
          this.mouseDeltaY += deltaClientY * scaleY;

          this.mouseX = (touch.clientX - rect.left) * scaleX;
          this.mouseY = (touch.clientY - rect.top) * scaleY;

          this.hasMouseMoved = true;
          this.isMouseDown = true;
          this.shoot = true;
          break;
        }
      }
    }, { passive: false });

    const onTouchEnd = (e: TouchEvent) => {
      if (this.activeTouchId === null) return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.activeTouchId) {
          this.activeTouchId = null;
          this.isMouseDown = false;
          this.shoot = false;
          this.mouseX = null;
          this.mouseY = null;
          this.hasMouseMoved = false;
          break;
        }
      }
    };

    window.addEventListener('touchend', onTouchEnd, { passive: false });
    window.addEventListener('touchcancel', onTouchEnd, { passive: false });
  }

  public clearTransientInputs(): void {
    this.shoot = false;
    this.isMouseDown = false;
    this.justShoot = false;
    this.justMouseDown = false;
    this.justEnter = false;
    this.justRotate = false;
    this.justDrop = false;
    this.justLeft = false;
    this.justRight = false;
    this.justEscape = false;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
  }

  public resetPerFrame(): void {
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
    this.selectedPieceIndex = null;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
  }
}
