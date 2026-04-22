type EventKey<Events> = Extract<keyof Events, string>;
type EventArgs<Events, K extends EventKey<Events>> = Events[K] extends unknown[]
  ? Events[K]
  : never;
type Callback<Args extends unknown[]> = (...args: Args) => void;

// 用 Map<string, Set<Callback>> 而不是普通对象，避免原型链污染并支持快速 add/delete。
class EventEmitter<Events extends object = Record<string, unknown[]>> {
  private _events = new Map<EventKey<Events>, Set<(...args: unknown[]) => void>>();

  on<K extends EventKey<Events>>(
    event: K,
    callback: Callback<EventArgs<Events, K>>,
  ): this {
    if (!this._events.has(event)) this._events.set(event, new Set());
    this._events.get(event)!.add(callback as (...args: unknown[]) => void);
    return this;
  }

  // callback 为空时清除该事件所有监听器，用于 destroy 场景。
  off<K extends EventKey<Events>>(
    event: K,
    callback?: Callback<EventArgs<Events, K>>,
  ): this {
    if (!callback) {
      this._events.delete(event);
    } else {
      this._events
        .get(event)
        ?.delete(callback as (...args: unknown[]) => void);
    }
    return this;
  }

  emit<K extends EventKey<Events>>(
    event: K,
    ...args: EventArgs<Events, K>
  ): void {
    this._events.get(event)?.forEach((callback) => callback(...args));
  }

  // 自动解绑，避免回调执行一次后仍留在监听列表。
  once<K extends EventKey<Events>>(
    event: K,
    callback: Callback<EventArgs<Events, K>>,
  ): this {
    const wrapper: Callback<EventArgs<Events, K>> = (...args) => {
      callback(...args);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }
}

export default EventEmitter;
