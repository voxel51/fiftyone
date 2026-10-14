import { afterEach, describe, expect, it, vi } from "vitest";
import { revealRow } from "./reveal";

function setup(start: number, reduced = false) {
  const element = document.createElement("div");
  Object.defineProperties(element, {
    clientHeight: { value: 600 },
    scrollHeight: { value: 100_000_000 },
  });
  element.scrollTop = start;
  element.scrollTo = vi.fn(({ top }: ScrollToOptions) => {
    element.scrollTop = top!;
  });
  vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++sequence, callback);
    return sequence;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  let now = 0;
  const frame = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    now += 16;
    callbacks.forEach((callback) => callback(now));
  };
  const finish = () => {
    while (frames.size) frame();
  };
  return {
    element,
    frames,
    frame,
    finish,
    controller: new AbortController(),
    render: vi.fn(),
  };
}
afterEach(() => vi.unstubAllGlobals());

describe("bounded row reveal", () => {
  it("does not move an already-visible tile", async () => {
    const { element, controller, render, finish } = setup(1000);
    const pending = revealRow(element, 1100, 200, controller.signal, render);
    finish();
    await pending;
    expect(element.scrollTo).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledOnce();
  });
  it("moves only enough to reveal a nearby tile, finishing within 200ms", async () => {
    const { element, controller, render, finish } = setup(1000);
    const pending = revealRow(element, 1550, 200, controller.signal, render);
    finish();
    await pending;
    expect(element.scrollTop).toBe(1150);
    expect(render.mock.calls.length).toBeGreaterThan(1);
    expect(render.mock.calls.length).toBeLessThanOrEqual(13);
  });
  it.each([0, 90_000_000])(
    "jumps directly to a far destination at %s",
    async (top) => {
      const { element, controller, render, finish } = setup(40_000_000);
      const pending = revealRow(element, top, 200, controller.signal, render);
      finish();
      await pending;
      expect(element.scrollTo).toHaveBeenCalledTimes(1);
      expect(render).toHaveBeenCalledTimes(1);
    },
  );
  it("respects reduced motion for nearby destinations", async () => {
    const { element, controller, render, finish } = setup(1000, true);
    const pending = revealRow(element, 1550, 200, controller.signal, render);
    finish();
    await pending;
    expect(element.scrollTo).toHaveBeenCalledTimes(1);
  });
  it("stops an animation immediately when cancelled", async () => {
    const { element, controller, render, frame, frames } = setup(1000);
    const pending = revealRow(element, 1550, 200, controller.signal, render);
    frame();
    frame();
    const stoppedAt = element.scrollTop;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(frames.size).toBe(0);
    expect(element.scrollTop).toBe(stoppedAt);
  });
});
