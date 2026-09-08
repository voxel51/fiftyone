import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  PointCloudRenderChannelPayload,
  PointCloudVisualization,
} from "../../../ir";
import {
  POINT_CLOUD_RGB_ENCODING,
  pointCloudNativeIntegerScalarEncoding,
} from "../../../runtime/point-cloud-channel-encoding";
import { VISUALIZATION_KIND } from "../../../ir";
import type { DataStream } from "./data-stream-context";
import {
  applyPointCloudRenderChannel,
  pointCloudFramesAtTime,
  usePointCloudPlaybackFrames,
} from "./use-stream-values";

const hookHarness = vi.hoisted(() => ({
  dataStream: null as DataStream | null,
  frames: [] as readonly unknown[],
}));

vi.mock("@fiftyone/playback", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fiftyone/playback")>()),
  useStreamValuesSelector: () => hookHarness.frames,
}));

vi.mock("./data-stream-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./data-stream-context")>()),
  useDataStream: () => hookHarness.dataStream,
}));

afterEach(() => {
  cleanup();
  hookHarness.dataStream = null;
  hookHarness.frames = [];
});

describe("point cloud render channel replacement", () => {
  it("reuses the exact geometry buffers when replacing a scalar channel", () => {
    const frame = pointCloudFrame();
    const positions = frame.renderPayload?.positions;
    const sourceIndices = frame.renderPayload?.sourceIndices;
    const bounds = frame.renderPayload?.bounds;
    const channel = {
      kind: "scalar",
      samplePlanKey: "4:2",
      scalarField: {
        encoding: pointCloudNativeIntegerScalarEncoding("uint16"),
        finiteValueCount: 2,
        name: "ring",
        range: { max: 8, min: 7 },
        values: new Uint16Array(1_024).fill(7, 0, 1).fill(8, 1, 2),
      },
    } satisfies PointCloudRenderChannelPayload;

    const result = applyPointCloudRenderChannel(frame, channel);

    expect(result).not.toBe(frame);
    expect(result.positions).toBe(frame.positions);
    expect(result.renderPayload?.positions).toBe(positions);
    expect(result.renderPayload?.sourceIndices).toBe(sourceIndices);
    expect(result.renderPayload?.bounds).toBe(bounds);
    expect(result.colors).toBeUndefined();
    expect(result.renderPayload?.rgb).toBeUndefined();
    expect(result.scalarFields).toBeUndefined();
    expect(result.renderPayload?.scalarFields).toEqual([channel.scalarField]);
    expect(result.renderPayload?.scalarFields[0].values).toBeInstanceOf(
      Uint16Array,
    );
  });

  it("propagates the RGB descriptor without rebuilding geometry", () => {
    const frame = pointCloudFrame();
    const rgb = {
      encoding: POINT_CLOUD_RGB_ENCODING,
      values: new Uint8Array(1_024 * 3),
    };
    rgb.values.set([255, 0, 0, 0, 255, 0]);

    const result = applyPointCloudRenderChannel(frame, {
      kind: "rgb",
      rgb,
      samplePlanKey: "4:2",
    });

    expect(result.renderPayload?.positions).toBe(
      frame.renderPayload?.positions,
    );
    expect(result.renderPayload?.rgb).toBe(rgb);
    expect(result.renderPayload?.rgb?.values).toBeInstanceOf(Uint8Array);
    expect(result.colors).toBeUndefined();
  });

  it("ignores a channel from a different geometry sample plan", () => {
    const frame = pointCloudFrame();

    expect(
      applyPointCloudRenderChannel(frame, {
        kind: "none",
        samplePlanKey: "different-plan",
      }),
    ).toBe(frame);
  });
});

describe("point cloud destination-time sampling", () => {
  it("selects the cached cloud at the destination sensor timestamp", () => {
    const frame = pointCloudFrame();
    const get = vi.fn(() => ({
      output: { visualization: frame },
      streamId: "/lidar",
      timestampNs: 8n,
    }));
    const nearestTick = vi.fn(() => 0n);
    const dataStream = {
      getStreamCache: () => ({ get }),
      getTimelineIndex: () => ({
        nearestTick,
        nsToSec: (timeNs: bigint) => Number(timeNs),
      }),
    } as unknown as DataStream;

    expect(pointCloudFramesAtTime(dataStream, ["/lidar"], 10n)).toEqual([
      { contentTimeNs: 8n, frame },
    ]);
    expect(nearestTick).toHaveBeenCalledWith(10);
    expect(get).toHaveBeenCalledWith(0n);
  });
});

describe("point cloud projection lifecycle", () => {
  it("keeps staggered sibling channel reads in flight without relaunching them", async () => {
    const lidar = deferred<PointCloudRenderChannelPayload>();
    const radar = deferred<PointCloudRenderChannelPayload>();
    const requests: Array<{
      readonly signal?: AbortSignal;
      readonly stream: string;
    }> = [];
    hookHarness.dataStream = {
      getStreamCache: () => undefined,
      getTimelineIndex: () => undefined,
      readPointCloudChannel: vi.fn((request) => {
        requests.push(request);
        return request.stream === "/lidar" ? lidar.promise : radar.promise;
      }),
      sourceKey: "source",
      subscribeToStream: () => () => undefined,
    } as unknown as DataStream;
    const lidarFrame = pointCloudFrame();
    const radarFrame = pointCloudFrame();
    hookHarness.frames = [
      { contentTimeNs: 10n, frame: lidarFrame },
      { contentTimeNs: 20n, frame: radarFrame },
    ];

    const { result } = renderHook(() =>
      usePointCloudPlaybackFrames(["/lidar", "/radar"], ["ring", "intensity"]),
    );
    await waitFor(() => expect(requests).toHaveLength(2));

    await act(async () => {
      lidar.resolve({ kind: "none", samplePlanKey: "4:2" });
      await lidar.promise;
    });
    await waitFor(() => expect(result.current[0]?.frame).not.toBe(lidarFrame));
    expect(requests).toHaveLength(2);
    expect(requests[1]?.signal?.aborted).toBe(false);

    await act(async () => {
      radar.resolve({ kind: "none", samplePlanKey: "4:2" });
      await radar.promise;
    });
    await waitFor(() => expect(result.current[1]?.frame).not.toBe(radarFrame));
    expect(requests).toHaveLength(2);
  });

  it("aborts only the sibling whose channel option became obsolete", async () => {
    const requests: Array<{
      readonly signal?: AbortSignal;
      readonly stream: string;
    }> = [];
    hookHarness.dataStream = {
      getStreamCache: () => undefined,
      getTimelineIndex: () => undefined,
      readPointCloudChannel: vi.fn((request) => {
        requests.push(request);
        return new Promise(() => undefined);
      }),
      sourceKey: "source",
      subscribeToStream: () => () => undefined,
    } as unknown as DataStream;
    hookHarness.frames = [
      { contentTimeNs: 10n, frame: pointCloudFrame() },
      { contentTimeNs: 20n, frame: pointCloudFrame() },
    ];

    const { rerender } = renderHook(
      ({ colorBy }: { readonly colorBy: readonly string[] }) =>
        usePointCloudPlaybackFrames(["/lidar", "/radar"], colorBy),
      { initialProps: { colorBy: ["ring", "ring"] } },
    );
    await waitFor(() => expect(requests).toHaveLength(2));

    rerender({ colorBy: ["intensity", "ring"] });
    await waitFor(() => expect(requests).toHaveLength(3));

    expect(requests[0]?.stream).toBe("/lidar");
    expect(requests[0]?.signal?.aborted).toBe(true);
    expect(requests[1]?.stream).toBe("/radar");
    expect(requests[1]?.signal?.aborted).toBe(false);
    expect(requests[2]?.stream).toBe("/lidar");
    expect(requests[2]?.signal?.aborted).toBe(false);
  });

  it("aborts obsolete color work and the replacement on unmount", async () => {
    const requests: Array<{ readonly signal?: AbortSignal }> = [];
    hookHarness.dataStream = {
      getStreamCache: () => undefined,
      getTimelineIndex: () => undefined,
      readPointCloudChannel: vi.fn((request) => {
        requests.push(request);
        return new Promise(() => undefined);
      }),
      sourceKey: "source",
      subscribeToStream: () => () => undefined,
    } as unknown as DataStream;
    hookHarness.frames = [{ contentTimeNs: 10n, frame: pointCloudFrame() }];

    const { rerender, unmount } = renderHook(
      ({ colorBy }: { readonly colorBy: readonly string[] }) =>
        usePointCloudPlaybackFrames(["/lidar"], colorBy),
      { initialProps: { colorBy: ["ring"] } },
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.signal?.aborted).toBe(false);

    rerender({ colorBy: ["intensity"] });
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0]?.signal?.aborted).toBe(true);
    expect(requests[1]?.signal?.aborted).toBe(false);

    unmount();
    expect(requests[1]?.signal?.aborted).toBe(true);
  });
});

function pointCloudFrame(): PointCloudVisualization {
  const positions = new Float32Array(1_024 * 3);
  positions.set([1, 2, 3, 4, 5, 6]);
  const sourceIndices = new Uint32Array(1_024);
  sourceIndices.set([1, 3]);
  const bounds = {
    max: [4, 5, 6],
    min: [1, 2, 3],
  } as const;

  return {
    fields: [],
    kind: VISUALIZATION_KIND.POINT_CLOUD,
    pointCount: 2,
    positions: positions.subarray(0, 6),
    renderPayload: {
      availableScalarFields: ["intensity", "ring"],
      bounds,
      capacity: 1_024,
      finitePointCount: 4,
      hasRgb: true,
      heightRange: { max: 6, min: 3 },
      positions,
      sampledPointCount: 2,
      samplePlanKey: "4:2",
      scalarFields: [],
      sourceIndices,
      sourcePointCount: 4,
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
