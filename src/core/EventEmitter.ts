type Callback = (...args: unknown[]) => void;

// 用 Map<string, Set<Callback>> 而不是普通对象，避免原型链污染并支持快速 add/delete
class EventEmitter {
  private _events: Map<string, Set<Callback>> = new Map();

  on(event: string, callback: Callback): this {
    if (!this._events.has(event)) this._events.set(event, new Set());
    this._events.get(event)!.add(callback);
    return this;
  }

  // callback 为空时清除该事件所有监听器，用于 destroy 场景
  off(event: string, callback?: Callback): this {
    if (!callback) {
      this._events.delete(event);
    } else {
      this._events.get(event)?.delete(callback);
    }
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    this._events.get(event)?.forEach(callback => callback(...args));
  }

  // 自动解绑，避免回调执行一次后仍留在监听列表
  once(event: string, callback: Callback): this {
    const wrapper: Callback = (...args) => {
      callback(...args);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }
}

export default EventEmitter;
