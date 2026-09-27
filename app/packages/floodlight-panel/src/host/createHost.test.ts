import { RowChange } from "@fiftyone/floodlight";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type Anchor, createHost, SETTLE, SLOT } from "./createHost";

class FakeInstance extends EventTarget {
  attach = vi.fn();
  destroy = vi.fn();
  load = () => this.dispatchEvent(new Event("load"));
}

let resize: (size: { width: number; height: number }) => void;
const disconnect = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = ({ width, height }) =>
          callback(
            [{ contentRect: { width, height } } as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          );
      }
      observe() {}
      disconnect = disconnect;
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  disconnect.mockReset();
});

const setup = (axis: "width" | "height" = "width") => {
  const element = document.createElement("div");
  const built: FakeInstance[] = [];
  const build = vi.fn(
    (_anchor: Anchor<number> | undefined, _context?: { interim: boolean }) => {
      const instance = new FakeInstance();
      built.push(instance);
      return instance;
    },
  );
  const host = createHost<number, FakeInstance>({ axis, build, element });
  return { build, built, element, host };
};

const slots = (element: HTMLElement) =>
  Array.from(element.children) as HTMLElement[];

describe("createHost", () => {
  test("shows the first instance immediately", () => {
    const { built, element, host } = setup();
    host.rebuild();

    const [slot] = slots(element);
    expect(built[0].attach).toHaveBeenCalledWith(slot);
    expect(slot.getAttribute(SLOT)).toBe("active");
    expect(slot.style.visibility).toBe("");
  });

  test("keeps the old instance until the new one loads", () => {
    const { built, element, host } = setup();
    host.rebuild();
    built[0].load();

    host.rebuild();
    const [, next] = slots(element);
    expect(next.style.visibility).toBe("hidden");
    expect(built[0].destroy).not.toHaveBeenCalled();

    built[1].load();
    expect(built[0].destroy).toHaveBeenCalled();
    expect(slots(element)).toEqual([next]);
    expect(next.style.visibility).toBe("");
    expect(host.instance).toBe(built[1]);
  });

  test("rebuilds an interim instance per resize tick, at the last anchor", () => {
    const { build, built, host } = setup();
    host.rebuild();
    built[0].load();
    built[0].dispatchEvent(new RowChange({ description: "sample" }, 3, 0.25));

    resize({ width: 800, height: 600 });
    resize({ width: 820, height: 600 });
    expect(build).toHaveBeenCalledTimes(2);
    expect(build).toHaveBeenLastCalledWith(
      { key: 3, at: { description: "sample", fraction: 0.25 } },
      { interim: true },
    );
  });

  test("keeps one interim build in flight and catches up after it swaps", () => {
    const { build, built, host } = setup();
    host.rebuild();
    built[0].load();
    resize({ width: 800, height: 600 });

    resize({ width: 820, height: 600 });
    resize({ width: 840, height: 600 });
    resize({ width: 860, height: 600 });
    expect(build).toHaveBeenCalledTimes(2);

    built[1].load();
    expect(build).toHaveBeenCalledTimes(3);
    expect(build).toHaveBeenLastCalledWith(undefined, { interim: true });
    built[2].load();
    expect(build).toHaveBeenCalledTimes(3);
  });

  test("builds the content instance once the resize settles", () => {
    const { build, built, host } = setup();
    host.rebuild();
    built[0].load();
    resize({ width: 800, height: 600 });
    resize({ width: 820, height: 600 });
    built[1].load();

    vi.advanceTimersByTime(SETTLE - 1);
    expect(build).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(build).toHaveBeenCalledTimes(3);
    expect(build).toHaveBeenLastCalledWith(undefined, { interim: false });

    built[2].load();
    expect(host.instance).toBe(built[2]);
  });

  test("the settled content build replaces a pending interim one", () => {
    const { build, built, host } = setup();
    host.rebuild();
    built[0].load();
    resize({ width: 800, height: 600 });
    resize({ width: 820, height: 600 });

    vi.advanceTimersByTime(SETTLE);
    expect(built[1].destroy).toHaveBeenCalled();
    expect(build).toHaveBeenLastCalledWith(undefined, { interim: false });
  });

  test("ignores primary-axis changes", () => {
    const { build, host } = setup("width");
    host.rebuild();
    resize({ width: 800, height: 600 });
    resize({ width: 800, height: 900 });
    expect(build).toHaveBeenCalledTimes(1);
  });

  test("watches height when the cross axis is vertical", () => {
    const { build, built, host } = setup("height");
    host.rebuild();
    built[0].load();
    resize({ width: 800, height: 200 });
    resize({ width: 800, height: 260 });
    expect(build).toHaveBeenCalledTimes(2);
  });

  test("runs onSwap before disposing the previous instance", () => {
    const element = document.createElement("div");
    const order: string[] = [];
    const built: FakeInstance[] = [];
    const host = createHost<number, FakeInstance>({
      axis: "width",
      element,
      build: () => {
        const instance = new FakeInstance();
        instance.destroy = vi.fn(() =>
          order.push(`destroy ${built.indexOf(instance)}`),
        );
        built.push(instance);
        return instance;
      },
      onSwap: (next, previous) =>
        order.push(
          `swap ${built.indexOf(next)} from ${previous ? built.indexOf(previous) : "none"}`,
        ),
    });
    host.rebuild();
    built[0].load();
    host.rebuild();
    built[1].load();
    expect(order).toEqual(["swap 0 from none", "swap 1 from 0", "destroy 0"]);
  });

  test("replacing a pending rebuild disposes it", () => {
    const { built, element, host } = setup();
    host.rebuild();
    built[0].load();
    host.rebuild();
    host.rebuild();

    expect(built[1].destroy).toHaveBeenCalled();
    expect(slots(element)).toHaveLength(2);
    built[1].load();
    expect(host.instance).toBe(built[0]);
  });

  test("destroy disposes every instance and stops observing", () => {
    const { built, element, host } = setup();
    host.rebuild();
    built[0].load();
    host.rebuild();
    host.destroy();

    expect(built[0].destroy).toHaveBeenCalled();
    expect(built[1].destroy).toHaveBeenCalled();
    expect(slots(element)).toHaveLength(0);
    expect(disconnect).toHaveBeenCalled();
  });
});
