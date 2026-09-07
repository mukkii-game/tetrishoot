// ユーザー入力の管理（テトリス操作用 JustPressed / Continuous 対応）
export class Input {
  public left = false;
  public right = false;
  public up = false;
  public down = false;
  public shoot = false;
  public mutePressed = false;

  // 単発押し判定（テトリスの回転や1マス移動用）
  public justLeft = false;
  public justRight = false;
  public justRotate = false;
  public justDrop = false;

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
      // 画面スクロール防止
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
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
          if (!this.shoot) this.justRotate = true; // テトリスタイム時はSpaceでも回転
          this.shoot = true;
          break;
        case 'KeyM':
          this.mutePressed = true;
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
        this.justRotate = true;
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
    });
  }

  public resetPerFrame(): void {
    this.mutePressed = false;
    this.justLeft = false;
    this.justRight = false;
    this.justRotate = false;
    this.justDrop = false;
  }
}
