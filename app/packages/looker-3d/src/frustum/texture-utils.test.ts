import { describe, expect, it } from "vitest";
import {
  applyTextureDimensionsToIntrinsics,
  getTextureDimensions,
} from "./texture-utils";
import type { CameraIntrinsics } from "./types";

describe("getTextureDimensions", () => {
  it("prefers natural image dimensions when available", () => {
    const texture = {
      image: {
        naturalWidth: 1920,
        naturalHeight: 1080,
        width: 640,
        height: 480,
      },
    } as any;

    expect(getTextureDimensions(texture)).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it("falls back to generic width and height", () => {
    const texture = {
      image: { width: 640, height: 480 },
    } as any;

    expect(getTextureDimensions(texture)).toEqual({
      width: 640,
      height: 480,
    });
  });

  it("falls back to video dimensions before generic width and height", () => {
    const texture = {
      image: { videoWidth: 1280, videoHeight: 720, width: 640, height: 480 },
    } as any;

    expect(getTextureDimensions(texture)).toEqual({
      width: 1280,
      height: 720,
    });
  });

  it("returns undefined when usable dimensions are unavailable", () => {
    const texture = {
      image: { width: 0, height: 0 },
    } as any;

    expect(getTextureDimensions(texture)).toBeUndefined();
  });
});

describe("applyTextureDimensionsToIntrinsics", () => {
  it("fills in missing image dimensions from the loaded texture", () => {
    const intrinsics: CameraIntrinsics = {
      fx: 1100,
      fy: 1100,
      cx: 960,
      cy: 540,
    };

    expect(
      applyTextureDimensionsToIntrinsics(intrinsics, {
        width: 1920,
        height: 1080,
      })
    ).toEqual({
      ...intrinsics,
      width: 1920,
      height: 1080,
    });
  });

  it("preserves explicit dataset dimensions", () => {
    const intrinsics: CameraIntrinsics = {
      fx: 1100,
      fy: 1100,
      cx: 960,
      cy: 540,
      width: 2000,
      height: 1000,
    };

    expect(
      applyTextureDimensionsToIntrinsics(intrinsics, {
        width: 1920,
        height: 1080,
      })
    ).toBe(intrinsics);
  });
});
