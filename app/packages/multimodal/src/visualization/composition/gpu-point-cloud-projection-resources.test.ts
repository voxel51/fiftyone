import { afterEach, describe, expect, it } from "vitest";

import {
  buildPointCloudRenderPayload,
  pointCloudNativeIntegerScalarEncoding,
} from "../../ir";
import {
  getGpuPointCloudProjectionResource,
  GPU_PROJECTION_RESOURCE_RETENTION_CAP,
  gpuPointCloudProjectionResourceStats,
  releaseGpuPointCloudProjectionResourcesForSource,
  resetGpuPointCloudProjectionResourcesForTests,
  retainGpuPointCloudProjectionResource,
} from "./gpu-point-cloud-projection-resources";

afterEach(() => resetGpuPointCloudProjectionResourcesForTests());

describe("GPU pointcloud projection resources", () => {
  it("shares grow-only attributes by stream and ignores same-content redelivery", () => {
    const payload = buildPointCloudRenderPayload({
      colors: new Float32Array([1, 0, 0, 0, 1, 0]),
      positions: new Float32Array([1, 2, 3, 4, 5, 6]),
      scalarFields: [
        { name: "intensity", values: new Float32Array([0.25, 0.75]) },
      ],
    });
    const first = getGpuPointCloudProjectionResource({
      contentKey: "frame",
      payload,
      streamKey: "points",
    });
    const second = getGpuPointCloudProjectionResource({
      contentKey: "frame",
      payload: buildPointCloudRenderPayload({
        colors: new Float32Array([1, 0, 0, 0, 1, 0]),
        positions: new Float32Array([1, 2, 3, 4, 5, 6]),
      }),
      streamKey: "points",
    });

    expect(second).toBe(first);
    expect(first.positionAttribute.array).toBe(payload.positions);
    expect(first.colorChannel?.values).toBe(payload.rgb?.values);
    expect(first.colorChannel?.values).toBeInstanceOf(Uint8Array);
    expect(first.colorChannel?.attribute.array.byteLength).toBe(
      payload.rgb?.values.byteLength,
    );
    expect(first.sourceIndexAttribute.array).toBe(payload.sourceIndices);
    expect(first.scalarChannels.get("intensity")?.values).toBe(
      payload.scalarFields[0].values,
    );
    expect(first.geometry.getAttribute("projectionPosition")).toBe(
      first.positionAttribute,
    );
    expect(first.geometry.getAttribute("projectionScalar0")).toBe(
      first.scalarChannels.get("intensity")?.attribute,
    );
    expect(first.sourceIndices).toBe(payload.sourceIndices);
    expect(first.sampledPointCount).toBe(2);
  });

  it("updates transferred arrays once per new frame without reallocating buffers", () => {
    const firstPayload = onePointPayload(1);
    const resource = getGpuPointCloudProjectionResource({
      contentKey: "frame-1",
      payload: firstPayload,
      streamKey: "points",
    });
    const position = resource.positionAttribute;
    const firstVersion = position.version;
    const secondPayload = onePointPayload(2);

    const updated = getGpuPointCloudProjectionResource({
      contentKey: "frame-2",
      payload: secondPayload,
      streamKey: "points",
    });
    const duplicateCamera = getGpuPointCloudProjectionResource({
      contentKey: "frame-2",
      payload: secondPayload,
      streamKey: "points",
    });

    expect(updated).toBe(resource);
    expect(duplicateCamera).toBe(resource);
    expect(position.array).toBe(secondPayload.positions);
    expect(position.version).toBe(firstVersion + 1);
    expect(gpuPointCloudProjectionResourceStats()).toMatchObject({
      entryCount: 1,
      totalFrameUpdates: 1,
      totalResourceAllocations: 1,
    });
  });

  it("removes optional attributes omitted by a replacement frame", () => {
    const resource = getGpuPointCloudProjectionResource({
      contentKey: "frame-1",
      payload: buildPointCloudRenderPayload({
        colors: new Float32Array([1, 0, 0]),
        positions: new Float32Array([1, 2, 3]),
        scalarFields: [{ name: "intensity", values: new Float32Array([0.25]) }],
      }),
      streamKey: "points",
    });

    const updated = getGpuPointCloudProjectionResource({
      contentKey: "frame-2",
      payload: onePointPayload(2),
      streamKey: "points",
    });

    expect(updated).toBe(resource);
    expect(resource.colorChannel).toBeNull();
    expect(resource.geometry.getAttribute("projectionColor")).toBeUndefined();
    expect(resource.scalarChannels.size).toBe(0);
    expect(resource.geometry.getAttribute("projectionScalar0")).toBeUndefined();
  });

  it("draws only authoritative samples from capacity-padded arrays", () => {
    const payload = buildPointCloudRenderPayload({
      positions: new Float32Array([1, 2, 3]),
    });
    const resource = getGpuPointCloudProjectionResource({
      contentKey: "padded",
      payload,
      streamKey: "points",
    });

    expect(payload.capacity).toBeGreaterThan(payload.sampledPointCount);
    expect(resource.sampledPointCount).toBe(1);
  });

  it("retains native-width integer scalar storage", () => {
    const payload = buildPointCloudRenderPayload({
      positions: new Float32Array([1, 2, 3, 4, 5, 6]),
    });
    const values = new Uint16Array(payload.capacity);
    values.set([1_000, 65_000]);
    const encodedPayload = {
      ...payload,
      scalarFields: [
        {
          encoding: pointCloudNativeIntegerScalarEncoding("uint16"),
          finiteValueCount: 2,
          name: "intensity",
          range: { max: 65_000, min: 1_000 },
          values,
        },
      ],
    };

    const resource = getGpuPointCloudProjectionResource({
      contentKey: "native-scalar",
      payload: encodedPayload,
      streamKey: "native-scalar",
    });
    const channel = resource.scalarChannels.get("intensity");

    expect(channel?.values).toBe(values);
    expect(channel?.values).toBeInstanceOf(Uint16Array);
    expect(channel?.attribute.array.byteLength).toBe(values.byteLength);
    expect(resource.positionAttribute.array).toBeInstanceOf(Float32Array);
  });

  it("bounds unpinned frames while preserving active resources", async () => {
    const pinned = getGpuPointCloudProjectionResource({
      contentKey: "active-0",
      payload: onePointPayload(0),
      streamKey: "active",
    });
    const release = retainGpuPointCloudProjectionResource(pinned);
    for (
      let index = 0;
      index < GPU_PROJECTION_RESOURCE_RETENTION_CAP + 3;
      index++
    ) {
      getGpuPointCloudProjectionResource({
        contentKey: `frame-${index}`,
        payload: onePointPayload(index),
        streamKey: `stream-${index}`,
      });
    }
    await Promise.resolve();

    expect(gpuPointCloudProjectionResourceStats()).toMatchObject({
      activeCount: 1,
      entryCount: GPU_PROJECTION_RESOURCE_RETENTION_CAP,
    });
    expect(
      getGpuPointCloudProjectionResource({
        contentKey: "active-0",
        payload: onePointPayload(99),
        streamKey: "active",
      }),
    ).toBe(pinned);
    release();
  });

  it("retires only the previous source and waits for live views", async () => {
    const previous = getGpuPointCloudProjectionResource({
      contentKey: "previous-frame",
      payload: onePointPayload(1),
      streamKey: "recording-a\n/lidar",
    });
    const current = getGpuPointCloudProjectionResource({
      contentKey: "current-frame",
      payload: onePointPayload(2),
      streamKey: "recording-b\n/lidar",
    });
    const release = retainGpuPointCloudProjectionResource(previous);
    let disposed = false;
    previous.geometry.addEventListener("dispose", () => {
      disposed = true;
    });

    releaseGpuPointCloudProjectionResourcesForSource("recording-a");
    await Promise.resolve();
    expect(disposed).toBe(false);
    expect(gpuPointCloudProjectionResourceStats()).toMatchObject({
      entryCount: 1,
      retiredCount: 1,
    });
    expect(
      getGpuPointCloudProjectionResource({
        contentKey: "current-frame",
        payload: onePointPayload(3),
        streamKey: "recording-b\n/lidar",
      }),
    ).toBe(current);

    release();
    await Promise.resolve();
    expect(disposed).toBe(true);
    expect(gpuPointCloudProjectionResourceStats().retiredCount).toBe(0);
  });
});

function onePointPayload(value: number) {
  return buildPointCloudRenderPayload({
    positions: new Float32Array([value, 0, 1]),
  });
}
