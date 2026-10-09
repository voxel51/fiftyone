import type { ItemData } from "@fiftyone/floodlight";
import type * as fos from "@fiftyone/state";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ItemCache } from "./types";
import useAutosize from "./useAutosize";

const setters = vi.hoisted(() => new Map<unknown, ReturnType<typeof vi.fn>>());

vi.mock("@fiftyone/reverb", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fiftyone/reverb")>()),
  useSetReverbState: (state: unknown) => {
    !setters.has(state) && setters.set(state, vi.fn());
    return setters.get(state);
  },
}));

const { recommendedGridZoom } = await import("./atoms");

const container = {
  current: { clientWidth: 1600, clientHeight: 900 } as HTMLElement,
};

const item = (
  description: string,
  width: number,
  height: number,
): ItemData<number, fos.Sample> => ({
  aspectRatio: width / height,
  data: {
    sample: { metadata: { frame_width: width, frame_height: height } },
  } as unknown as fos.Sample,
  id: { description },
  key: 0,
});

const mount = (cache: Partial<ItemCache> = {}) =>
  renderHook(() =>
    useAutosize({
      budget: 5e8,
      cache: { get: () => undefined, ...cache } as unknown as ItemCache,
      container,
      store: new WeakMap(),
      zoom: () => 10,
    }),
  ).result.current;

describe("useAutosize", () => {
  it("starts a page of large items at a smaller zoom and recommends it", () => {
    const { start } = mount();
    const items = Array.from({ length: 20 }, (_, i) =>
      item(`${i}`, 3840, 2160),
    );

    const rowAspect = start(items);
    expect(rowAspect).toBeLessThan(10);
    expect(setters.get(recommendedGridZoom)).toHaveBeenCalledWith(-rowAspect);
  });

  it("keeps the zoom for items that fit", () => {
    setters.get(recommendedGridZoom)?.mockClear();
    const { start } = mount();

    expect(start([item("a", 320, 240)])).toBe(10);
    expect(setters.get(recommendedGridZoom)).not.toHaveBeenCalled();
  });

  it("sizes a deferred show by its cached looker", async () => {
    const sizeOf = vi.fn(() => Promise.resolve(7));
    const { size } = mount({ get: (() => ({})) as ItemCache["get"], sizeOf });

    await expect(size({ id: { description: "a" } })).resolves.toBe(7);
    expect(sizeOf).toHaveBeenCalledWith("a");
  });
});
