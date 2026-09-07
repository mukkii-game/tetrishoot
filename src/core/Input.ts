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
  public justTab = false;
  public selectedPieceIndex: number | null = null;

  public mouseX: number | null = null;
  public mouseY: number | null = null;
  public isMouseDown = false;
  public hasMouseMoved = false;

  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.setupListeners();
  }

  private setupListeners(): void {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) {
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
          if (!this.shoot) this.justRotate = true;
          this.shoot = true;
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
        case 'Escape':
          this.escape = false;
          break;
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      this.mouseX = (e.clientX - rect.left) * scaleX;
      this.mouseY = (e.clientY - rect.top) * scaleY;
      this.hasMouseMoved = true;
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
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
    });
  }

  public resetPerFrame(): void {
    this.mutePressed = false;
    this.justEscape = false;
    this.justLeft = false;
    this.justRight = false;
    this.justRotate = false;
    this.justDrop = false;
    this.justTab = false;
    this.selectedPieceIndex = null;
  }
}
