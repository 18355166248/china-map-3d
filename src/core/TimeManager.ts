import * as THREE from 'three';
import EventEmitter from './EventEmitter';

class TimeManager extends EventEmitter {
  private clock: THREE.Clock;
  private rafId: number = 0;
  private stopped = false;

  constructor() {
    super();
    this.clock = new THREE.Clock();
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
