import { afterEach, describe, expect, it, vi } from "vitest";

import type { PreparedImageAnnotations } from "./gpu-image-annotation-preparation";
import {
  getGpuImageAnnotationResource,
  releaseGpuImageAnnotationResourcesForSource,
  resetGpuImageAnnotationResourcesForTests,
  retainGpuImageAnnotationResource,
} from "./gpu-image-annotation-resources";

afterEach(() => resetGpuImageAnnotationResourcesForTests());

describe("GPU image annotation resources", () => {
  it("reuses grow-only attributes and uploads new frame contents in place", () => {
    const first = payload(3, 2, 4, 10);
    const resource = getGpuImageAnnotationResource("tile", first);
    const centerAttribute = resource.points.centerAttribute;
    const startAttribute = resource.segments.startAttribute;
    const pickAttribute = resource.pick.aAttribute;

    const second = payload(2, 1, 2, 40);
    const reused = getGpuImageAnnotationResource("tile", second);

    expect(reused).toBe(resource);
    expect(reused.revision).toBe(1);
    expect(reused.points.centerAttribute).toBe(centerAttribute);
    expect(reused.segments.startAttribute).toBe(startAttribute);
    expect(reused.pick.aAttribute).toBe(pickAttribute);
    expect(reused.points.count).toBe(2);
    expect(reused.segments.count).toBe(1);
    expect(reused.pick.count).toBe(2);
    expect(Array.from(reused.points.centerAttribute.array.slice(0, 4))).toEqual(
      [40, 41, 42, 43],
    );
  });

  it("publishes replacement storage only when a batch outgrows capacity", () => {
    const resource = getGpuImageAnnotationResource("tile", payload(3, 1, 1, 0));
    const replacement = getGpuImageAnnotationResource(
      "tile",
      payload(5, 1, 1, 0),
    );

    expect(replacement).not.toBe(resource);
    expect(replacement.points.centerAttribute).not.toBe(
      resource.points.centerAttribute,
    );
    expect(replacement.points.count).toBe(5);
  });

  it("retires only one source and waits for its live tile to release", async () => {
    const previous = getGpuImageAnnotationResource(
      "recording-a\ntile-a\n/camera",
      payload(1, 1, 1, 0),
    );
    const current = getGpuImageAnnotationResource(
      "recording-b\ntile-b\n/camera",
      payload(1, 1, 1, 10),
    );
    const releasePrevious = retainGpuImageAnnotationResource(previous);
    const previousDispose = vi.fn();
    const currentDispose = vi.fn();
    previous.points.geometry.addEventListener("dispose", previousDispose);
    current.points.geometry.addEventListener("dispose", currentDispose);

    releaseGpuImageAnnotationResourcesForSource("recording-a");
    await Promise.resolve();

    expect(previousDispose).not.toHaveBeenCalled();
    expect(currentDispose).not.toHaveBeenCalled();
    expect(
      getGpuImageAnnotationResource(
        "recording-b\ntile-b\n/camera",
        payload(1, 1, 1, 20),
      ),
    ).toBe(current);

    releasePrevious();
    await Promise.resolve();

    expect(previousDispose).toHaveBeenCalledOnce();
    expect(currentDispose).not.toHaveBeenCalled();
  });

  it("disposes unleased source buffers after source teardown", async () => {
    const resource = getGpuImageAnnotationResource(
      "recording-a\ntile-a\n/camera",
      payload(1, 1, 1, 0),
    );
    const dispose = vi.fn();
    resource.points.geometry.addEventListener("dispose", dispose);

    releaseGpuImageAnnotationResourcesForSource("recording-a");
    await Promise.resolve();

    expect(dispose).toHaveBeenCalledOnce();
  });
});

function payload(
  pointCount: number,
  segmentCount: number,
  pickCount: number,
  offset: number,
): PreparedImageAnnotations {
  return {
    metadata: [],
    picks: {
      a: sequence(pickCount * 2, offset),
      b: sequence(pickCount * 2, offset),
      c: sequence(pickCount * 2, offset),
      count: pickCount,
      kinds: new Float32Array(pickCount),
      orders: new Float32Array(pickCount),
      primitiveIndices: new Uint32Array(pickCount),
      radii: new Float32Array(pickCount),
    },
    pointOffsets: new Uint32Array(1),
    points: {
      centers: sequence(pointCount * 2, offset),
      colors: sequence(pointCount * 3, offset),
      count: pointCount,
      diameters: new Float32Array(pointCount),
      kinds: new Float32Array(pointCount),
      primitiveIndices: new Uint32Array(pointCount),
      thicknesses: new Float32Array(pointCount),
    },
    segmentOffsets: new Uint32Array(1),
    segments: {
      colors: sequence(segmentCount * 3, offset),
      count: segmentCount,
      ends: sequence(segmentCount * 2, offset),
      primitiveIndices: new Uint32Array(segmentCount),
      starts: sequence(segmentCount * 2, offset),
      thicknesses: new Float32Array(segmentCount),
    },
  };
}

function sequence(length: number, offset: number): Float32Array {
  return Float32Array.from({ length }, (_, index) => offset + index);
}
