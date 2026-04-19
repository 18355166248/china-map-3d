import { Timer } from "three/addons/misc/Timer.js";
import EventEmitter from "./EventEmitter";

// RAF 驱动的帧定时器，每帧 emit('tick', deltaTime, elapsedTime)
// 各特效模块通过 time.on('tick') 订阅，避免分散的 requestAnimationFrame 调用
class TimeManager extends EventEmitter {
  private timer: Timer;
  private rafId: number = 0;
  private stopped = false;

  constructor() {
    super();
    this.timer = new Timer();
    // 构造后立即启动，订阅者在同一同步块内注册（RAF 回调在下一帧才执行）
    this.rafId = requestAnimationFrame((ts) => this.tick(ts));
  }

  private tick(timestamp: number): void {
    if (this.stopped) return;
    this.timer.update(timestamp);
    const deltaTime = this.timer.getDelta();
    const elapsedTime = this.timer.getElapsed();
    this.emit("tick", deltaTime, elapsedTime);
    this.rafId = requestAnimationFrame((ts) => this.tick(ts));
  }

  destroy(): void {
    this.stopped = true;
    cancelAnimationFrame(this.rafId);
    this.off("tick");
  }
}

export default TimeManager;
