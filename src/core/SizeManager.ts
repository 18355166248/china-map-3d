import EventEmitter from './EventEmitter';

class SizeManager extends EventEmitter {
  canvas: HTMLCanvasElement;
  width: number = 0;
  height: number = 0;
  pixelRatio: number = 1;

  private onResize: () => void;

  constructor(canvas: HTMLCanvasElement) {
    super();
    this.canvas = canvas;
    this.onResize = () => {
      this.update();
      this.emit('resize');
    };
    window.addEventListener('resize', this.onResize);
    this.update();
  }

  private update(): void {
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.pixelRatio = Math.min(window.devicePixelRatio, 2);
  }

  destroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.off('resize');
  }
}

export default SizeManager;
