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
      if (e.button === 0) {
        if (!this.isMouseDown) this.justMouseDown = true;
        this.isMouseDown = true;
        this.shoot = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.isMouseDown = false;
        this.shoot = false;
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.hasMouseMoved = false;
      this.mouseX = null;
      this.mouseY = null;
      this.mouseDeltaX = 0;
      this.mouseDeltaY = 0;
    });
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
