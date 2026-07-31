import { act, renderHook } from "@testing-library/react-hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useImageNaturalSize } from "./useImageNaturalSize";

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  complete = false;
  naturalWidth = 0;
  naturalHeight = 0;
  private _src = "";

  get src() {
    return this._src;
  }

  set src(value: string) {
    this._src = value;
  }
}

let instances: FakeImage[] = [];
const originalImage = global.Image;

beforeEach(() => {
  instances = [];
  // @ts-expect-error -- test double, not a full Image implementation
  global.Image = function () {
    const img = new FakeImage();
    instances.push(img);
    return img;
  };
});

afterEach(() => {
  global.Image = originalImage;
});

const resolveLoad = (index: number, w: number, h: number) => {
  const img = instances[index];
  img.naturalWidth = w;
  img.naturalHeight = h;
  act(() => {
    img.onload?.();
  });
};

describe("useImageNaturalSize", () => {
  it("resolves the natural size once the image loads", () => {
    const { result } = renderHook(() => useImageNaturalSize("a.jpg"));

    expect(result.current).toBeNull();

    resolveLoad(0, 640, 480);

    expect(result.current).toEqual({ w: 640, h: 480 });
  });

  it("clears the previous size as soon as the url changes, before the new image loads", () => {
    const { result, rerender } = renderHook(
      ({ url }) => useImageNaturalSize(url),
      { initialProps: { url: "a.jpg" } },
    );

    resolveLoad(0, 640, 480);
    expect(result.current).toEqual({ w: 640, h: 480 });

    // New url; the second image hasn't fired onload yet.
    rerender({ url: "b.jpg" });

    // Regression: the stale size from "a.jpg" must not leak into "b.jpg"'s
    // dimensions while the new image is still loading.
    expect(result.current).toBeNull();

    resolveLoad(1, 100, 200);
    expect(result.current).toEqual({ w: 100, h: 200 });
  });

  it("warns and leaves size unset on a failed load", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useImageNaturalSize("broken.jpg"));

    act(() => {
      instances[0].onerror?.();
    });

    expect(result.current).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("broken.jpg"));

    warn.mockRestore();
  });
});
