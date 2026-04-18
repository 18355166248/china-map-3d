import EventEmitter from './EventEmitter';

// 基于 canvas.clientWidth/Height 而非 window.innerWidth/Height，支持组件嵌入场景
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
    // 限制 pixelRatio 最大为 2，防止高 DPI 设备渲染压力过大
    this.pixelRatio = Math.min(window.devicePixelRatio, 2);
  }

  destroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.off('resize');
  }
}

export default SizeManager;
