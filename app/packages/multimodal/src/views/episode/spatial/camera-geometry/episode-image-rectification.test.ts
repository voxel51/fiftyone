import { describe, expect, it } from "vitest";

import type { EpisodeCameraModel } from "./episode-camera-model";
import { episodeRectifiedImageDisplay } from "./episode-image-rectification";

const original: EpisodeCameraModel = {
  D: [0.1, 0, 0, 0, 0, 0, 0, 0],
  height: 100,
  K: [100, 0, 50, 0, 100, 50, 0, 0, 1],
  kind: "rational-polynomial",
  maxRadius: 1,
  space: "original",
  width: 100,
};
const rectified: EpisodeCameraModel = {
  height: 100,
  kind: "pinhole",
  projection: [100, 0, 50, 20, 0, 100, 50, 0, 0, 0, 1, 0],
  rectification: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  space: "rectified",
  width: 100,
};

describe("episode rectified image display", () => {
  it("builds and caches a rectified texture mesh", () => {
    const first = episodeRectifiedImageDisplay(original, rectified);
    const second = episodeRectifiedImageDisplay(original, rectified);

    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(first?.textureMesh.indices.length).toBeGreaterThan(0);
    expect(first?.textureMesh.displayWidth).toBe(100);
    expect(first?.textureMesh.displayHeight).toBe(100);
  });

  it("transforms source annotations without applying stereo translation", () => {
    const display = episodeRectifiedImageDisplay(original, rectified);
    expect(display?.pixelTransform(50, 50)).toEqual([50, 50]);
    expect(display?.projectionModel.projection[3]).toBe(20);
  });

  it("refuses rectification when the recorded image is already rectified", () => {
    expect(episodeRectifiedImageDisplay(rectified, rectified)).toBeNull();
  });
});
