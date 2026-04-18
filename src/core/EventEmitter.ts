type Callback = (...args: unknown[]) => void;

class EventEmitter {
  private _events: Map<string, Set<Callback>> = new Map();

  on(event: string, cb: Callback): this {
    if (!this._events.has(event)) this._events.set(event, new Set());
    this._events.get(event)!.add(cb);
    return this;
  }

  off(event: string, cb?: Callback): this {
    if (!cb) {
      this._events.delete(event);
    } else {
      this._events.get(event)?.delete(cb);
    }
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    this._events.get(event)?.forEach(cb => cb(...args));
  }

  once(event: string, cb: Callback): this {
    const wrapper: Callback = (...args) => {
      cb(...args);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }
}

export default EventEmitter;
