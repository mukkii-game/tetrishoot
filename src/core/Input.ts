// ユーザー入力の管理（キーボード＆マウス）
export class Input {
  public left = false;
  public right = false;
  public up = false;
  public down = false;
  public shoot = false;
  public mutePressed = false;
  
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
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          this.left = true;
          this.hasMouseMoved = false;
          break;
        case 'ArrowRight':
        case 'KeyD':
          this.right = true;
          this.hasMouseMoved = false;
          break;
        case 'ArrowUp':
        case 'KeyW':
          this.up = true;
          break;
        case 'ArrowDown':
        case 'KeyS':
          this.down = true;
          break;
        case 'Space':
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
  }
}
