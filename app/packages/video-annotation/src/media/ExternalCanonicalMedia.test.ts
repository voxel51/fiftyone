import type { Renderer2D } from "@fiftyone/lighter";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ExternalCanonicalMedia,
  letterboxRect,
} from "./ExternalCanonicalMedia";

describe("letterboxRect", () => {
  it("fills exactly when aspect ratios match", () => {
    expect(letterboxRect({ width: 1920, height: 1080 }, 1280, 720)).toEqual({
      x: 0,
      y: 0,
      width: 1280,
      height: 720,
    });
  });

  it("pillarboxes media wider than the container", () => {
    expect(letterboxRect({ width: 200, height: 100 }, 100, 100)).toEqual({
      x: 0,
      y: 25,
      width: 100,
      height: 50,
    });
  });

  it("letterboxes media taller than the container", () => {
    expect(letterboxRect({ width: 100, height: 200 }, 100, 100)).toEqual({
      x: 25,
      y: 0,
      width: 50,
      height: 100,
    });
  });
});

describe("ExternalCanonicalMedia", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sizes from the rounded client size when a resize reports a fractional one", () => {
    let notify: ResizeObserverCallback = () => undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          notify = callback;
        }
        observe() {}
        disconnect() {}
      },
    );

    const parent = document.createElement("div");
    Object.defineProperty(parent, "clientWidth", { value: 914 });
    Object.defineProperty(parent, "clientHeight", { value: 565 });
    const canvas = document.createElement("canvas");
    parent.appendChild(canvas);

    const media = new ExternalCanonicalMedia({ width: 100, height: 100 });
    media.setRenderer({ getCanvas: () => canvas } as unknown as Renderer2D);
    const initial = media.getRenderedBounds();

    notify(
      [{ contentRect: { width: 914, height: 564.5 } } as ResizeObserverEntry],
      {} as ResizeObserver,
    );

    expect(media.getRenderedBounds()).toEqual(initial);
    expect(initial).toEqual({ x: 174.5, y: 0, width: 565, height: 565 });
  });
});
