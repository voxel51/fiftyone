import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildPointCloudRenderPayload } from "../runtime/point-cloud-render-payload";
import type { PointCloudRenderPayload } from "../ir";
import {
  getGpuPointCloudProjectionResource,
  resetGpuPointCloudProjectionResourcesForTests,
  retainGpuPointCloudProjectionResource,
} from "./composition/gpu-point-cloud-projection-resources";
import type { PreparedImageAnnotations } from "./media-2d/gpu-image-annotation-preparation";
import {
  getGpuImageAnnotationResource,
  resetGpuImageAnnotationResourcesForTests,
  retainGpuImageAnnotationResource,
} from "./media-2d/gpu-image-annotation-resources";

interface ObservedResource {
  readonly geometry: THREE.BufferGeometry;
  readonly resource: object;
  readonly value: () => number;
}

interface ResourceLifecycleHarness {
  readonly failUpdate: (key: string, error: Error) => void;
  readonly get: (
    key: string,
    capacity: number,
    value: number,
  ) => ObservedResource;
  readonly reset: () => void;
  readonly retain: (resource: ObservedResource) => () => void;
}

const harnesses: readonly {
  readonly create: () => ResourceLifecycleHarness;
  readonly name: string;
}[] = [
  {
    create: createImageAnnotationHarness,
    name: "image annotation resources",
  },
  {
    create: createPointCloudProjectionHarness,
    name: "point-cloud projection resources",
  },
];

for (const { create, name } of harnesses) {
  describe(`${name} keyed lifecycle`, () => {
    let harness: ResourceLifecycleHarness;

    beforeEach(() => {
      resetGpuImageAnnotationResourcesForTests();
      resetGpuPointCloudProjectionResourcesForTests();
      harness = create();
    });

    afterEach(() => {
      resetGpuImageAnnotationResourcesForTests();
      resetGpuPointCloudProjectionResourcesForTests();
    });

    it("reuses storage and applies payload updates in place", () => {
      const first = harness.get("stream", 4, 1);
      const updated = harness.get("stream", 2, 7);

      expect(updated.resource).toBe(first.resource);
      expect(updated.value()).toBe(7);
    });

    it("publishes replacement storage when capacity grows", () => {
      const first = harness.get("stream", 1, 1);
      const replacement = harness.get("stream", 2, 2);

      expect(replacement.resource).not.toBe(first.resource);
      expect(replacement.value()).toBe(2);
    });

    it("defers disposal when retirement happens before release", async () => {
      const first = harness.get("stream", 1, 1);
      const dispose = vi.fn();
      first.geometry.addEventListener("dispose", dispose);
      const release = harness.retain(first);

      harness.get("stream", 2, 2);
      await Promise.resolve();
      expect(dispose).not.toHaveBeenCalled();

      release();
      await Promise.resolve();
      expect(dispose).toHaveBeenCalledOnce();
    });

    it("disposes after growth when release happens before retirement", async () => {
      const first = harness.get("stream", 1, 1);
      const dispose = vi.fn();
      first.geometry.addEventListener("dispose", dispose);
      const release = harness.retain(first);

      release();
      harness.get("stream", 2, 2);
      await Promise.resolve();

      expect(dispose).toHaveBeenCalledOnce();
    });

    it("resets live and retired resources exactly once", () => {
      const first = harness.get("stream", 1, 1);
      const dispose = vi.fn();
      first.geometry.addEventListener("dispose", dispose);
      const release = harness.retain(first);

      harness.reset();
      release();
      release();
      harness.reset();

      expect(dispose).toHaveBeenCalledOnce();
    });

    it("keeps the current entry reachable when a payload update throws", () => {
      const first = harness.get("stream", 4, 1);
      const error = new Error("update failed");

      expect(() => harness.failUpdate("stream", error)).toThrow(error);
      const recovered = harness.get("stream", 4, 3);

      expect(recovered.resource).toBe(first.resource);
      expect(recovered.value()).toBe(3);
    });

    it("makes releases idempotent and retaining disposed storage a no-op", () => {
      const first = harness.get("stream", 1, 1);
      const dispose = vi.fn();
      first.geometry.addEventListener("dispose", dispose);
      const release = harness.retain(first);

      release();
      release();
      const releaseAgain = harness.retain(first);
      releaseAgain();
      releaseAgain();
      harness.reset();
      const releaseDisposed = harness.retain(first);
      releaseDisposed();
      releaseDisposed();

      expect(dispose).toHaveBeenCalledOnce();
    });
  });
}

function createImageAnnotationHarness(): ResourceLifecycleHarness {
  const get = (key: string, capacity: number, value: number) => {
    const resource = getGpuImageAnnotationResource(
      key,
      imageAnnotationPayload(capacity, value),
    );
    return {
      geometry: resource.points.geometry,
      resource,
      value: () => resource.points.centerAttribute.getX(0),
    };
  };
  return {
    failUpdate: (key, error) => {
      const invalid = imageAnnotationPayload(1, 2);
      Object.defineProperty(invalid.points, "centers", {
        get: () => {
          throw error;
        },
      });
      getGpuImageAnnotationResource(key, invalid);
    },
    get,
    reset: resetGpuImageAnnotationResourcesForTests,
    retain: ({ resource }) =>
      retainGpuImageAnnotationResource(
        resource as ReturnType<typeof getGpuImageAnnotationResource>,
      ),
  };
}

function createPointCloudProjectionHarness(): ResourceLifecycleHarness {
  const get = (key: string, capacity: number, value: number) => {
    const resource = getGpuPointCloudProjectionResource({
      contentKey: `frame-${value}`,
      payload: pointCloudPayload(capacity, value),
      streamKey: key,
    });
    return {
      geometry: resource.geometry,
      resource,
      value: () => resource.positionAttribute.getX(0),
    };
  };
  return {
    failUpdate: (key, error) => {
      const invalid = pointCloudPayload(4, 2);
      Object.defineProperty(invalid, "scalarFields", {
        get: () => {
          throw error;
        },
      });
      getGpuPointCloudProjectionResource({
        contentKey: "failing-frame",
        payload: invalid,
        streamKey: key,
      });
    },
    get,
    reset: resetGpuPointCloudProjectionResourcesForTests,
    retain: ({ resource }) =>
      retainGpuPointCloudProjectionResource(
        resource as ReturnType<typeof getGpuPointCloudProjectionResource>,
      ),
  };
}

function imageAnnotationPayload(
  count: number,
  value: number,
): PreparedImageAnnotations {
  return {
    metadata: [],
    picks: {
      a: new Float32Array(count * 2),
      b: new Float32Array(count * 2),
      c: new Float32Array(count * 2),
      count,
      kinds: new Float32Array(count),
      orders: new Float32Array(count),
      primitiveIndices: new Uint32Array(count),
      radii: new Float32Array(count),
    },
    pointOffsets: new Uint32Array(1),
    points: {
      centers: Float32Array.from({ length: count * 2 }, () => value),
      colors: new Float32Array(count * 3),
      count,
      diameters: new Float32Array(count),
      kinds: new Float32Array(count),
      primitiveIndices: new Uint32Array(count),
      thicknesses: new Float32Array(count),
    },
    segmentOffsets: new Uint32Array(1),
    segments: {
      colors: new Float32Array(count * 3),
      count,
      ends: new Float32Array(count * 2),
      primitiveIndices: new Uint32Array(count),
      starts: new Float32Array(count * 2),
      thicknesses: new Float32Array(count),
    },
  };
}

function pointCloudPayload(
  capacity: number,
  value: number,
): PointCloudRenderPayload {
  return {
    ...buildPointCloudRenderPayload({
      positions: new Float32Array([value, 0, 1]),
    }),
    capacity,
  };
}
