/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { afterEach, describe, expect, test, vi } from "vitest";
import { createMaskCanvas } from "./createMaskCanvas";

describe("createMaskCanvas", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns canvas and 2d context with the requested dimensions", () => {
    const { maskCanvas, maskContext } = createMaskCanvas(64, 32);

    expect(maskCanvas).toBeInstanceOf(HTMLCanvasElement);
    expect(maskCanvas.width).toBe(64);
    expect(maskCanvas.height).toBe(32);
    expect(maskContext).toBeDefined();
  });

  test("requests willReadFrequently to avoid GPU readback penalty", () => {
    const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext");

    createMaskCanvas(8, 8);

    expect(getContextSpy).toHaveBeenCalledWith("2d", {
      willReadFrequently: true,
    });
  });

  test("defaults to a 0x0 canvas when no dimensions are given", () => {
    const { maskCanvas } = createMaskCanvas();
    expect(maskCanvas.width).toBe(0);
    expect(maskCanvas.height).toBe(0);
  });

  test("draws the seed bitmap at the given offset when provided", () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);

    const bitmap = {} as ImageBitmap;
    createMaskCanvas(16, 16, 4, 6, bitmap);

    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawImage).toHaveBeenCalledWith(bitmap, 4, 6);
  });

  test("does not call drawImage when no bitmap is supplied", () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);

    createMaskCanvas(16, 16);

    expect(drawImage).not.toHaveBeenCalled();
  });

  test("throws when the browser cannot provide a 2d context", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    expect(() => createMaskCanvas(4, 4, 0, 0, {} as ImageBitmap)).toThrow();
  });
});
