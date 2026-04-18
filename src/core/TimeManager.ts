import * as THREE from 'three';
import EventEmitter from './EventEmitter';

// RAF 驱动的帧定时器，每帧 emit('tick', deltaTime, elapsedTime)
// 各特效模块通过 time.on('tick') 订阅，避免分散的 requestAnimationFrame 调用
class TimeManager extends EventEmitter {
  private clock: THREE.Clock;
  private rafId: number = 0;
  private stopped = false;

  constructor() {
    super();
    this.clock = new THREE.Clock();
    // 构造后立即启动，订阅者在同一同步块内注册（RAF 回调在下一帧才执行）
    this.rafId = requestAnimationFrame(() => this.tick());
  }

  private tick(): void {
    if (this.stopped) return;
    const deltaTime = this.clock.getDelta();
    const elapsedTime = this.clock.getElapsedTime();
    this.emit('tick', deltaTime, elapsedTime);
    this.rafId = requestAnimationFrame(() => this.tick());
  }

  destroy(): void {
    this.stopped = true;
    cancelAnimationFrame(this.rafId);
    this.off('tick');
  }
}

export default TimeManager;
