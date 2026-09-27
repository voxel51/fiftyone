import { RowChange } from "@fiftyone/floodlight";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type Anchor, createHost, SLOT } from "./createHost";

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
  const build = vi.fn((_anchor: Anchor<number> | undefined) => {
    const instance = new FakeInstance();
    built.push(instance);
    return instance;
  });
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

  test("rebuilds once per settled cross-axis resize, at the last anchor", () => {
    const { build, built, host } = setup();
    host.rebuild();
    built[0].load();
    built[0].dispatchEvent(new RowChange({ description: "sample" }, 3, 0.25));

    resize({ width: 800, height: 600 });
    resize({ width: 820, height: 600 });
    resize({ width: 840, height: 600 });
    expect(build).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(150);
    expect(build).toHaveBeenCalledTimes(2);
    expect(build).toHaveBeenLastCalledWith({
      key: 3,
      at: { description: "sample", fraction: 0.25 },
    });
  });

  test("ignores primary-axis changes", () => {
    const { build, host } = setup("width");
    host.rebuild();
    resize({ width: 800, height: 600 });
    resize({ width: 800, height: 900 });
    vi.advanceTimersByTime(500);
    expect(build).toHaveBeenCalledTimes(1);
  });

  test("watches height when the cross axis is vertical", () => {
    const { build, host } = setup("height");
    host.rebuild();
    resize({ width: 800, height: 200 });
    resize({ width: 800, height: 260 });
    vi.advanceTimersByTime(150);
    expect(build).toHaveBeenCalledTimes(2);
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
