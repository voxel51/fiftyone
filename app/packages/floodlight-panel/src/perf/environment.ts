import { vi } from "vitest";

export interface Size {
  width: number;
  height: number;
}

type Frame = { handle: number; callback: FrameRequestCallback };

const SCROLL = ["scrollTop", "scrollLeft"] as const;
const CLIENT = ["clientWidth", "clientHeight"] as const;

/**
 * A jsdom environment a real Floodlight instance can lay out in: every
 * element measures `size`, animation frames run only when flushed, and
 * `setTimeout` is fake so settle and scrollend timers advance on demand.
 */
export const installEnvironment = (initial: Size) => {
  let size = { ...initial };
  let frames: Frame[] = [];
  let handle = 0;
  let time = 0;
  const observers = new Set<FakeResizeObserver>();
  const scroll = new WeakMap<Element, { top: number; left: number }>();

  class FakeResizeObserver {
    readonly targets = new Set<Element>();
    constructor(readonly callback: ResizeObserverCallback) {
      observers.add(this);
    }
    observe(target: Element) {
      this.targets.add(target);
    }
    unobserve(target: Element) {
      this.targets.delete(target);
    }
    disconnect() {
      this.targets.clear();
      observers.delete(this);
    }
  }

  const rect = () =>
    ({
      ...size,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: size.width,
      bottom: size.height,
      toJSON: () => ({}),
    }) as DOMRect;

  const originalScrollTo = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "scrollTo",
  );
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push({ handle: ++handle, callback });
    return handle;
  });
  vi.stubGlobal("cancelAnimationFrame", (cancelled: number) => {
    frames = frames.filter((frame) => frame.handle !== cancelled);
  });
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    rect,
  );

  const position = (element: Element) => {
    let value = scroll.get(element);
    if (!value) {
      value = { top: 0, left: 0 };
      scroll.set(element, value);
    }
    return value;
  };
  for (const [property, field] of [
    [SCROLL[0], "top"],
    [SCROLL[1], "left"],
  ] as const) {
    Object.defineProperty(HTMLElement.prototype, property, {
      configurable: true,
      get() {
        return position(this)[field];
      },
      set(value: number) {
        position(this)[field] = Math.max(0, value);
      },
    });
  }
  for (const property of CLIENT) {
    Object.defineProperty(HTMLElement.prototype, property, {
      configurable: true,
      get: () => (property === "clientWidth" ? size.width : size.height),
    });
  }
  HTMLElement.prototype.scrollTo = function (
    this: HTMLElement,
    x?: ScrollToOptions | number,
    y?: number,
  ) {
    const options = typeof x === "object" ? x : { left: x, top: y };
    const value = position(this);
    value.left = Math.max(0, options.left ?? value.left);
    value.top = Math.max(0, options.top ?? value.top);
  };

  /** Runs the callbacks queued before this frame; returns how many ran. */
  const frame = () => {
    const pending = frames;
    frames = [];
    time += 16;
    for (const { callback } of pending) callback(time);
    return pending.length;
  };

  const microtasks = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };

  /** Alternates microtask drains and frames so async page loads resolve. */
  const idle = async (rounds = 30) => {
    for (let i = 0; i < rounds; i++) {
      await microtasks();
      frame();
    }
    await microtasks();
  };

  return {
    frame,
    idle,
    get size() {
      return size;
    },
    /** Observers that were never disconnected. */
    get liveObservers() {
      return observers.size;
    },
    /** Resizes every element and notifies each live observer. */
    resize: (next: Size) => {
      size = { ...next };
      for (const observer of [...observers]) {
        const entries = [...observer.targets].map(
          (target) => ({ target, contentRect: rect() }) as ResizeObserverEntry,
        );
        entries.length &&
          observer.callback(entries, observer as unknown as ResizeObserver);
      }
    },
    tick: async (ms: number) => {
      await vi.advanceTimersByTimeAsync(ms);
    },
    restore: () => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      for (const property of [...SCROLL, ...CLIENT]) {
        delete (HTMLElement.prototype as unknown as Record<string, unknown>)[
          property
        ];
      }
      delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo;
      originalScrollTo &&
        Object.defineProperty(
          HTMLElement.prototype,
          "scrollTo",
          originalScrollTo,
        );
    },
  };
};

export type Environment = ReturnType<typeof installEnvironment>;
