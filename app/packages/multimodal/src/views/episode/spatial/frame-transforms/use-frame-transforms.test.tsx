import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  PlaybackProvider,
  usePlayback,
  usePlaybackStream,
} from "@fiftyone/playback/runtime";
import { type ComponentProps, useEffect, useMemo } from "react";
import { Quaternion, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ByteSourceDescriptor } from "../../../../query/bytes";
import type { TransformSample } from "../../../../ir";
import type {
  EpisodeFrameTransformSample,
  EpisodeFrameTransformSet,
} from "../../../../runtime/frame-transform-types";
import { EpisodeReadCancelledError } from "../../../../ports";
import {
  useFrameTransforms,
  type FramePlacementScope,
  type FrameTransformsState,
} from "./use-frame-transforms";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useFrameTransforms", () => {
  it("keeps resolver identity stable for semantically equal policies", async () => {
    const onState = vi.fn();
    const props = {
      client: createFrameTransformClient(),
      label: "frames",
      onState,
      source: null,
    } as const;
    const { rerender } = render(
      <FrameTransformsHarness
        {...props}
        policy={{ boundaryClampNs: 1_000_000n }}
      />,
    );
    await flushReactWork();
    const settledState = onState.mock.lastCall?.[0];
    const settledCallCount = onState.mock.calls.length;

    rerender(
      <FrameTransformsHarness
        {...props}
        policy={{ boundaryClampNs: 1_000_000n }}
      />,
    );
    await flushReactWork();

    expect(onState).toHaveBeenCalledTimes(settledCallCount);
    expect(onState.mock.lastCall?.[0]).toBe(settledState);
  });

  it("loads bootstrap transforms without waiting for a playback time", async () => {
    const source = createSource("bootstrap");
    const client = createFrameTransformClient({
      bootstrapSamples: [sample("base_link", "lidar")],
    });
    const onState = vi.fn();

    render(
      <FrameTransformsHarness
        client={client}
        label="frames"
        onState={onState}
        source={source}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("frames").textContent).toBe("ready:resolved:");
    });
    await waitFor(() => {
      expect(onState).toHaveBeenLastCalledWith(
        expect.objectContaining({
          frameIds: ["base_link", "lidar"],
        }),
      );
    });
    expect(client.readFrameTransformBootstrap).toHaveBeenCalledWith({
      source,
    });
    expect(client.readFrameTransformWindow).not.toHaveBeenCalled();
  });

  it("prefetches a dynamic window for the current playback time", async () => {
    const source = createSource("dynamic");
    const client = createFrameTransformClient({
      bootstrapSamples: [sample("base_link", "lidar")],
      windowSamples: [sample("map", "base_link", { x: 1, y: 0, z: 0 }, 100n)],
    });

    render(
      <FrameTransformsHarness
        client={client}
        label="frames"
        source={source}
        timeNs={100n}
      />,
    );

    await waitFor(() => {
      expect(client.readFrameTransformWindow).toHaveBeenCalledWith(
        {
          activeTimeline: undefined,
          endTimeNs: 1_000_000_100n,
          source,
          startTimeNs: 0n,
        },
        { priority: undefined },
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId("frames").textContent).toBe("ready:resolved:");
    });
  });

  it("queues the current transform window before warming the idle runway", async () => {
    const source = createSource("source-range");
    const client = createFrameTransformClient({
      bootstrapSamples: [sample("base_link", "lidar")],
      windowSamples: [sample("map", "base_link", { x: 1, y: 0, z: 0 }, 100n)],
    });

    const { rerender } = render(
      <FrameTransformsHarness
        client={client}
        dynamicRange={{ endTimeNs: 10_000_000_000n, startTimeNs: 0n }}
        label="frames"
        source={source}
        timeNs={100n}
      />,
    );

    await waitFor(() => {
      expect(client.readFrameTransformWindow).toHaveBeenCalled();
    });
    expect(vi.mocked(client.readFrameTransformWindow).mock.calls[0]).toEqual([
      {
        activeTimeline: undefined,
        endTimeNs: 1_000_000_100n,
        source,
        startTimeNs: 0n,
      },
      { priority: undefined },
    ]);
    await waitFor(() => {
      expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(2);
    });
    expect(vi.mocked(client.readFrameTransformWindow).mock.calls[1]).toEqual([
      {
        activeTimeline: undefined,
        endTimeNs: 2_400_000_100n,
        source,
        startTimeNs: 900_000_100n,
      },
      { priority: "idle" },
    ]);
    await waitFor(() => {
      expect(screen.getByTestId("frames").textContent).toBe("ready:resolved:");
    });
    rerender(
      <FrameTransformsHarness
        client={client}
        dynamicRange={{ endTimeNs: 10_000_000_000n, startTimeNs: 0n }}
        label="frames"
        source={source}
        timeNs={900n}
      />,
    );

    await flushReactWork();
    expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(2);

    rerender(
      <FrameTransformsHarness
        client={client}
        dynamicRange={{ endTimeNs: 10_000_000_000n, startTimeNs: 0n }}
        label="frames"
        source={source}
        timeNs={2_100_000_000n}
      />,
    );

    await waitFor(() => {
      expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(3);
    });
    expect(vi.mocked(client.readFrameTransformWindow).mock.calls[2]).toEqual([
      {
        activeTimeline: undefined,
        endTimeNs: 3_800_000_100n,
        source,
        startTimeNs: 2_300_000_100n,
      },
      { priority: "idle" },
    ]);
    expect(
      vi.mocked(client.readFrameTransformWindow).mock.calls,
    ).not.toContainEqual([
      {
        activeTimeline: undefined,
        endTimeNs: 10_000_000_000n,
        source,
        startTimeNs: 0n,
      },
      { priority: "idle" },
    ]);
  });

  it("rebuilds transform cache when the active timeline changes", async () => {
    const source = createSource("timeline-switch");
    const client = createFrameTransformClient({
      bootstrapSamples: [sample("base_link", "lidar")],
      windowSamples: [sample("map", "base_link", { x: 1, y: 0, z: 0 }, 100n)],
    });

    const { rerender } = render(
      <FrameTransformsHarness
        client={client}
        label="frames"
        source={source}
        timeNs={100n}
      />,
    );

    await waitFor(() => {
      expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByTestId("frames").textContent).toBe("ready:resolved:");
    });

    rerender(
      <FrameTransformsHarness
        activeTimeline="log"
        client={client}
        label="frames"
        source={source}
        timeNs={100n}
      />,
    );

    await waitFor(() => {
      expect(client.readFrameTransformBootstrap).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(2);
    });
    expect(client.readFrameTransformWindow).toHaveBeenLastCalledWith(
      {
        activeTimeline: "log",
        endTimeNs: 1_000_000_100n,
        source,
        startTimeNs: 0n,
      },
      { priority: undefined },
    );
  });

  it("keeps one in-flight dynamic window when playback advances inside it", async () => {
    const source = createSource("moving-time");
    const windowRead = deferred<EpisodeFrameTransformSet>();
    const client = createFrameTransformClient({
      readFrameTransformWindow: vi.fn(() => windowRead.promise),
    });

    const { rerender } = render(
      <FrameTransformsHarness
        client={client}
        label="frames"
        source={source}
        timeNs={100n}
      />,
    );

    await waitFor(() => {
      expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(1);
    });

    rerender(
      <FrameTransformsHarness
        client={client}
        label="frames"
        source={source}
        timeNs={200n}
      />,
    );
    expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(1);

    windowRead.resolve({
      samples: [sample("base_link", "lidar", undefined, 100n)],
    });

    await waitFor(() => {
      expect(screen.getByTestId("frames").textContent).toBe("ready:resolved:");
    });
  });

  it("reports placement readiness before, during, and after dynamic windows", async () => {
    const source = createSource("placement-readiness");
    const windowRead = deferred<EpisodeFrameTransformSet>();
    const client = createFrameTransformClient({
      bootstrapSamples: [sample("base_link", "lidar")],
      readFrameTransformWindow: vi.fn(() => windowRead.promise),
    });
    const latestState: { current: FrameTransformsState | null } = {
      current: null,
    };

    const { rerender } = render(
      <FrameTransformsHarness
        client={client}
        label="frames"
        onState={(state) => {
          latestState.current = state;
        }}
        source={source}
      />,
    );

    await waitFor(() => {
      expect(latestState.current?.status).toBe("ready");
    });
    expect(requireLatestState(latestState).isPlacementTimeSettled?.(100n)).toBe(
      false,
    );
    expect(
      requireLatestState(latestState).getPlacementReadiness({
        frameIds: ["lidar"],
        targetFrameId: "map",
        timeNs: 100n,
      }),
    ).toEqual({ frameIds: ["lidar"], status: "needsFetch" });

    rerender(
      <FrameTransformsHarness
        client={client}
        label="frames"
        onState={(state) => {
          latestState.current = state;
        }}
        source={source}
        timeNs={100n}
      />,
    );
    await waitFor(() => {
      expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(1);
    });
    expect(requireLatestState(latestState).isPlacementTimeSettled?.(100n)).toBe(
      false,
    );
    expect(
      requireLatestState(latestState).getPlacementReadiness({
        frameIds: ["lidar"],
        targetFrameId: "map",
        timeNs: 100n,
      }),
    ).toEqual({ frameIds: ["lidar"], status: "loading" });

    windowRead.resolve({
      samples: [sample("map", "base_link", undefined, 100n)],
    });
    await waitFor(() => {
      expect(
        latestState.current?.getPlacementReadiness({
          frameIds: ["lidar"],
          targetFrameId: "map",
          timeNs: 100n,
        }).status,
      ).toBe("ready");
    });
    expect(requireLatestState(latestState).isPlacementTimeSettled?.(100n)).toBe(
      true,
    );
  });

  it("treats an indexed no-path placement as definitive missing", async () => {
    const source = createSource("placement-missing");
    const client = createFrameTransformClient({
      bootstrapSamples: [sample("base_link", "lidar")],
      windowSamples: [],
    });
    const latestState: { current: FrameTransformsState | null } = {
      current: null,
    };

    render(
      <FrameTransformsHarness
        client={client}
        label="frames"
        onState={(state) => {
          latestState.current = state;
        }}
        source={source}
        timeNs={100n}
      />,
    );

    await waitFor(() => {
      expect(
        requireLatestState(latestState).getPlacementReadiness({
          frameIds: ["lidar"],
          targetFrameId: "map",
          timeNs: 100n,
        }),
      ).toEqual({ frameIds: ["lidar"], status: "definitiveMissing" });
    });
  });

  it("backs off and caps retries after dynamic window read failures", async () => {
    vi.useFakeTimers();
    const source = createSource("retry");
    const client = createFrameTransformClient({
      readFrameTransformWindow: vi.fn(async () => {
        throw new Error("temporary tf failure");
      }),
    });
    const latestState: { current: FrameTransformsState | null } = {
      current: null,
    };

    const { rerender } = render(
      <FrameTransformsHarness
        client={client}
        label="frames"
        onState={(state) => {
          latestState.current = state;
        }}
        source={source}
        timeNs={100n}
      />,
    );

    await flushReactWork();
    expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("frames").textContent).toBe(
      "ready:pending:temporary tf failure",
    );

    await runNextTimer();
    await flushReactWork();
    expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(2);

    await runNextTimer();
    await flushReactWork();
    expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(3);

    await runNextTimer();
    await flushReactWork();
    expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(4);

    await runNextTimer();
    expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(4);
    expect(screen.getByTestId("frames").textContent).toBe(
      "ready:pending:temporary tf failure",
    );
    expect(
      requireLatestState(latestState).getPlacementReadiness({
        frameIds: ["lidar"],
        targetFrameId: "map",
        timeNs: 100n,
      }),
    ).toEqual({ frameIds: ["lidar"], status: "definitiveMissing" });
    expect(requireLatestState(latestState).isPlacementTimeSettled?.(100n)).toBe(
      true,
    );

    rerender(
      <FrameTransformsHarness
        client={client}
        label="frames"
        onState={(state) => {
          latestState.current = state;
        }}
        source={source}
        timeNs={2_000_000_000n}
      />,
    );

    await flushReactWork();
    expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(5);
  });

  it("treats superseded placement reads as benign", async () => {
    const source = createSource("superseded-placement");
    const staleRead = deferred<EpisodeFrameTransformSet>();
    const latestRead = deferred<EpisodeFrameTransformSet>();
    const client = createFrameTransformClient({
      readFrameTransformWindow: vi
        .fn()
        .mockImplementationOnce(() => staleRead.promise)
        .mockImplementationOnce(() => latestRead.promise),
    });
    const { rerender } = render(
      <FrameTransformsHarness
        client={client}
        label="frames"
        source={source}
        timeNs={100n}
      />,
    );
    await waitFor(() => {
      expect(client.readFrameTransformWindow).toHaveBeenCalledOnce();
    });

    rerender(
      <FrameTransformsHarness
        client={client}
        label="frames"
        source={source}
        timeNs={2_000_000_000n}
      />,
    );
    await waitFor(() => {
      expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(2);
    });

    latestRead.resolve({ samples: [] });
    await flushReactWork();
    staleRead.reject(new EpisodeReadCancelledError());
    await flushReactWork();

    expect(screen.getByTestId("frames").textContent).toBe("ready:missing:");
    expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(2);
  });

  it("clears surrendered placement windows on an explicit seek", async () => {
    vi.useFakeTimers();
    const source = createSource("retry-seek");
    const client = createFrameTransformClient({
      readFrameTransformWindow: vi.fn(async () => {
        throw new Error("temporary tf failure");
      }),
    });
    const latestState: { current: FrameTransformsState | null } = {
      current: null,
    };
    let playback: ReturnType<typeof usePlayback> | null = null;

    render(
      <PlaybackFrameTransformsHarness
        client={client}
        label="frames"
        onPlayback={(api) => {
          playback = api;
        }}
        onState={(state) => {
          latestState.current = state;
        }}
        source={source}
        timeNs={100n}
      />,
    );

    await flushReactWork();
    expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(1);

    await runNextTimer();
    await flushReactWork();
    await runNextTimer();
    await flushReactWork();
    await runNextTimer();
    await flushReactWork();
    expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(4);
    expect(
      requireLatestState(latestState).getPlacementReadiness({
        frameIds: ["lidar"],
        targetFrameId: "map",
        timeNs: 100n,
      }),
    ).toEqual({ frameIds: ["lidar"], status: "definitiveMissing" });

    act(() => {
      playback?.seek(1);
    });
    await flushReactWork();
    expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(5);
  });

  it("uses edge-complete point placement while paused or Play-pending", async () => {
    const source = createSource("paused-point-placement");
    const dynamicSample = sample("map", "lidar", { x: 1, y: 0, z: 0 }, 100n);
    const unrelatedSample = sample("odom", "other", { x: 0, y: 1, z: 0 }, 100n);
    const readFrameTransformPlacement = vi.fn(
      async ({ timeNs }: { readonly timeNs: bigint }) => ({
        indexedWindow: { endNs: timeNs, startNs: timeNs - 10n },
        samples: [sample("map", "lidar", { x: 1, y: 0, z: 0 }, timeNs)],
      }),
    );
    const client = createFrameTransformClient({
      readFrameTransformPlacement,
      windowSamples: [
        ...[70n, 80n, 90n].map((timeNs) =>
          sample("map", "lidar", { x: 1, y: 0, z: 0 }, timeNs),
        ),
        dynamicSample,
        unrelatedSample,
      ],
    });
    let playback: ReturnType<typeof usePlayback> | null = null;
    const { rerender } = render(
      <PlaybackFrameTransformsHarness
        client={client}
        dynamicRange={{ endTimeNs: 10_000_000_000n, startTimeNs: 0n }}
        holdPlayPending
        label="frames"
        onPlayback={(api) => {
          playback = api;
        }}
        placementScope={{ frameIds: ["lidar"], targetFrameId: "map" }}
        source={source}
        timeNs={100n}
      />,
    );

    await waitFor(() => {
      expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(1);
    });
    await flushReactWork();
    expect(readFrameTransformPlacement).not.toHaveBeenCalled();

    rerender(
      <PlaybackFrameTransformsHarness
        client={client}
        dynamicRange={{ endTimeNs: 10_000_000_000n, startTimeNs: 0n }}
        holdPlayPending
        label="frames"
        onPlayback={(api) => {
          playback = api;
        }}
        placementScope={{ frameIds: ["lidar"], targetFrameId: "map" }}
        source={source}
        timeNs={2_000_000_000n}
      />,
    );

    await waitFor(() => {
      expect(readFrameTransformPlacement).toHaveBeenCalledExactlyOnceWith({
        requiredDynamicChildFrameIds: ["lidar"],
        timeNs: 2_000_000_000n,
      });
    });
    await flushReactWork();
    expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(1);

    act(() => {
      playback?.play();
    });
    await waitFor(() => {
      expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(2);
    });
    expect(client.readFrameTransformWindow).toHaveBeenNthCalledWith(
      2,
      {
        activeTimeline: undefined,
        endTimeNs: 3_400_000_000n,
        source,
        startTimeNs: 1_900_000_000n,
      },
      { priority: "playback" },
    );

    rerender(
      <PlaybackFrameTransformsHarness
        client={client}
        dynamicRange={{ endTimeNs: 10_000_000_000n, startTimeNs: 0n }}
        holdPlayPending
        label="frames"
        onPlayback={(api) => {
          playback = api;
        }}
        placementScope={{ frameIds: ["lidar"], targetFrameId: "map" }}
        source={source}
        timeNs={5_000_000_000n}
      />,
    );
    await waitFor(() => {
      expect(readFrameTransformPlacement).toHaveBeenNthCalledWith(2, {
        requiredDynamicChildFrameIds: ["lidar"],
        timeNs: 5_000_000_000n,
      });
    });
  });

  it("uses point placement for an explicit seek while playback is active", async () => {
    const source = createSource("active-seek-point-placement");
    const readFrameTransformPlacement = vi.fn(
      async ({ timeNs }: { readonly timeNs: bigint }) => ({
        indexedWindow: { endNs: timeNs, startNs: timeNs - 10n },
        samples: [sample("map", "lidar", undefined, timeNs)],
      }),
    );
    const client = createFrameTransformClient({
      readFrameTransformPlacement,
      windowSamples: [
        ...[70n, 80n, 90n].map((timeNs) =>
          sample("map", "lidar", undefined, timeNs),
        ),
        sample("map", "lidar", undefined, 100n),
      ],
    });
    let playback: ReturnType<typeof usePlayback> | null = null;
    const props = {
      client,
      dynamicRange: { endTimeNs: 10_000_000_000n, startTimeNs: 0n },
      label: "frames",
      onPlayback: (api: ReturnType<typeof usePlayback>) => {
        playback = api;
      },
      placementScope: { frameIds: ["lidar"], targetFrameId: "map" },
      source,
    } as const;
    const { rerender } = render(
      <PlaybackFrameTransformsHarness {...props} timeNs={100n} />,
    );

    await waitFor(() => {
      expect(client.readFrameTransformWindow).toHaveBeenCalledOnce();
    });
    rerender(
      <PlaybackFrameTransformsHarness {...props} timeNs={2_000_000_000n} />,
    );
    await waitFor(() => {
      expect(readFrameTransformPlacement).toHaveBeenCalledOnce();
    });

    act(() => {
      playback?.play();
      playback?.seek(5);
    });
    rerender(
      <PlaybackFrameTransformsHarness {...props} timeNs={5_000_000_000n} />,
    );

    await waitFor(() => {
      expect(readFrameTransformPlacement).toHaveBeenNthCalledWith(2, {
        requiredDynamicChildFrameIds: ["lidar"],
        timeNs: 5_000_000_000n,
      });
    });
  });

  it("uses one window instead of probing a path without cadence evidence", async () => {
    const source = createSource("paused-window-placement");
    const dynamicSample = sample("map", "lidar", undefined, 100n);
    const readFrameTransformPlacement = vi.fn(async () => ({
      indexedWindow: { endNs: 2_000_000_000n, startNs: 1_999_999_990n },
      samples: [dynamicSample],
    }));
    const client = createFrameTransformClient({
      readFrameTransformPlacement,
      windowSamples: [dynamicSample],
    });
    const { rerender } = render(
      <PlaybackFrameTransformsHarness
        client={client}
        dynamicRange={{ endTimeNs: 10_000_000_000n, startTimeNs: 0n }}
        label="frames"
        onPlayback={() => undefined}
        placementScope={{ frameIds: ["lidar"], targetFrameId: "map" }}
        source={source}
        timeNs={100n}
      />,
    );
    await waitFor(() => {
      expect(client.readFrameTransformWindow).toHaveBeenCalledOnce();
    });

    rerender(
      <PlaybackFrameTransformsHarness
        client={client}
        dynamicRange={{ endTimeNs: 10_000_000_000n, startTimeNs: 0n }}
        label="frames"
        onPlayback={() => undefined}
        placementScope={{ frameIds: ["lidar"], targetFrameId: "map" }}
        source={source}
        timeNs={2_000_000_000n}
      />,
    );
    await waitFor(() => {
      expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(2);
    });
    expect(readFrameTransformPlacement).not.toHaveBeenCalled();
  });

  it("falls back when scoped anchors do not resolve after a parent change", async () => {
    const source = createSource("parent-change-placement");
    const initialSample = sample("map", "lidar", undefined, 100n);
    const initialCadenceSamples = [70n, 80n, 90n].map((timeNs) =>
      sample("map", "lidar", undefined, timeNs),
    );
    const targetTimeNs = 2_000_000_000n;
    const readFrameTransformPlacement = vi.fn(async () => ({
      indexedWindow: {
        endNs: targetTimeNs,
        startNs: targetTimeNs - 10n,
      },
      samples: [sample("odom", "lidar", undefined, targetTimeNs - 1n)],
    }));
    const readFrameTransformWindow = vi
      .fn()
      .mockResolvedValueOnce({
        samples: [...initialCadenceSamples, initialSample],
      })
      .mockResolvedValueOnce({
        samples: [sample("map", "lidar", undefined, targetTimeNs)],
      });
    const client = createFrameTransformClient({
      readFrameTransformPlacement,
      readFrameTransformWindow,
    });
    const { rerender } = render(
      <PlaybackFrameTransformsHarness
        client={client}
        dynamicRange={{ endTimeNs: 10_000_000_000n, startTimeNs: 0n }}
        label="frames"
        onPlayback={() => undefined}
        placementScope={{ frameIds: ["lidar"], targetFrameId: "map" }}
        source={source}
        timeNs={100n}
      />,
    );
    await waitFor(() => {
      expect(readFrameTransformWindow).toHaveBeenCalledOnce();
    });

    rerender(
      <PlaybackFrameTransformsHarness
        client={client}
        dynamicRange={{ endTimeNs: 10_000_000_000n, startTimeNs: 0n }}
        label="frames"
        onPlayback={() => undefined}
        placementScope={{ frameIds: ["lidar"], targetFrameId: "map" }}
        source={source}
        timeNs={targetTimeNs}
      />,
    );

    await waitFor(() => {
      expect(readFrameTransformPlacement).toHaveBeenCalledOnce();
      expect(readFrameTransformWindow).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("frames").textContent).toBe("ready:missing:");
    });
  });

  it("falls back to the full placement window when point closure is incomplete", async () => {
    const source = createSource("incomplete-point-placement");
    const dynamicSample = sample("map", "lidar", { x: 1, y: 0, z: 0 }, 100n);
    const readFrameTransformPlacement = vi.fn(async () => null);
    const client = createFrameTransformClient({
      readFrameTransformPlacement,
      windowSamples: [
        ...[70n, 80n, 90n].map((timeNs) =>
          sample("map", "lidar", { x: 1, y: 0, z: 0 }, timeNs),
        ),
        dynamicSample,
      ],
    });
    const { rerender } = render(
      <PlaybackFrameTransformsHarness
        client={client}
        dynamicRange={{ endTimeNs: 10_000_000_000n, startTimeNs: 0n }}
        label="frames"
        onPlayback={() => undefined}
        placementScope={{ frameIds: ["lidar"], targetFrameId: "map" }}
        source={source}
        timeNs={100n}
      />,
    );
    await waitFor(() => {
      expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(1);
    });

    rerender(
      <PlaybackFrameTransformsHarness
        client={client}
        dynamicRange={{ endTimeNs: 10_000_000_000n, startTimeNs: 0n }}
        label="frames"
        onPlayback={() => undefined}
        placementScope={{ frameIds: ["lidar"], targetFrameId: "map" }}
        source={source}
        timeNs={2_000_000_000n}
      />,
    );

    await waitFor(() => {
      expect(readFrameTransformPlacement).toHaveBeenCalledOnce();
      expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(2);
    });
    expect(client.readFrameTransformWindow).toHaveBeenLastCalledWith(
      {
        activeTimeline: undefined,
        endTimeNs: 2_250_000_000n,
        source,
        startTimeNs: 1_500_000_000n,
      },
      { priority: undefined },
    );
  });
});

function PlaybackFrameTransformsHarness({
  holdPlayPending = false,
  onPlayback,
  ...props
}: ComponentProps<typeof FrameTransformsHarness> & {
  readonly holdPlayPending?: boolean;
  readonly onPlayback: (playback: ReturnType<typeof usePlayback>) => void;
}) {
  return (
    <PlaybackProvider duration={10} stepInterval={1 / 30}>
      {holdPlayPending ? <PendingPlaybackBlocker /> : null}
      <PlaybackControlsBridge onPlayback={onPlayback} />
      <FrameTransformsHarness {...props} />
    </PlaybackProvider>
  );
}

function PendingPlaybackBlocker() {
  const { subscribeStream } = usePlayback();
  usePlaybackStream(
    useMemo(
      () => ({
        blocking: true,
        bufferState: () => "ready" as const,
        bufferedRanges: () => [],
        id: "pending-playback-test",
        prefetch: () => undefined,
        startupBufferSeconds: 1,
      }),
      [],
    ),
  );
  useEffect(() => subscribeStream("pending-playback-test"), [subscribeStream]);
  return null;
}

function PlaybackControlsBridge({
  onPlayback,
}: {
  readonly onPlayback: (playback: ReturnType<typeof usePlayback>) => void;
}) {
  const playback = usePlayback();

  // This effect exposes playback controls to the test harness.
  useEffect(() => {
    onPlayback(playback);
  }, [onPlayback, playback]);

  return null;
}

function FrameTransformsHarness({
  activeTimeline,
  client,
  dynamicRange,
  label,
  onState,
  placementScope,
  policy,
  source,
  timeNs,
}: {
  readonly activeTimeline?: "log";
  readonly client: FrameTransformClient;
  readonly dynamicRange?: {
    readonly endTimeNs: bigint;
    readonly startTimeNs: bigint;
  } | null;
  readonly label: string;
  readonly onState?: (state: FrameTransformsState) => void;
  readonly placementScope?: FramePlacementScope;
  readonly policy?: { readonly boundaryClampNs: bigint };
  readonly source: ByteSourceDescriptor | null;
  readonly timeNs?: bigint;
}) {
  const capability = useMemo(
    () =>
      source
        ? {
            readBootstrap: async () =>
              (
                await client.readFrameTransformBootstrap({ source })
              ).samples.map(toIrTransformSample),
            ...(client.readFrameTransformPlacement
              ? {
                  readPlacement: async (request: {
                    readonly requiredDynamicChildFrameIds: readonly string[];
                    readonly timeNs: bigint;
                  }) => {
                    const placement =
                      await client.readFrameTransformPlacement?.(request);
                    return placement
                      ? {
                          indexedWindow: placement.indexedWindow,
                          samples: placement.samples.map(toIrTransformSample),
                        }
                      : null;
                  },
                }
              : {}),
            readTransforms: async (request: {
              readonly priority?: "bulk" | "current" | "idle" | "playback";
              readonly window: {
                readonly endNs: bigint;
                readonly startNs: bigint;
              };
            }) =>
              (
                await client.readFrameTransformWindow(
                  {
                    activeTimeline,
                    endTimeNs: request.window.endNs,
                    source,
                    startTimeNs: request.window.startNs,
                  },
                  { priority: request.priority },
                )
              ).samples.map(toIrTransformSample),
          }
        : null,
    [activeTimeline, client, source],
  );
  const state = useFrameTransforms({
    capability,
    dynamicRange,
    policy,
    sourceKey: source?.sourceId ?? null,
    timeNs,
  });
  const resolution = state.resolve("lidar", "base_link", timeNs ?? 0n);

  // This effect reports transform state changes to assertions outside React.
  useEffect(() => {
    onState?.(state);
  }, [onState, state]);

  const registerPlacementScope = state.registerPlacementScope;
  useEffect(() => {
    if (!placementScope) return undefined;
    return registerPlacementScope?.(placementScope);
  }, [placementScope, registerPlacementScope]);

  return (
    <div data-testid={label}>
      {`${state.status}:${resolution.status}:${state.error ?? ""}`}
    </div>
  );
}

function toIrTransformSample(
  sample: EpisodeFrameTransformSample,
): TransformSample {
  return {
    childFrameId: sample.childFrameId,
    parentFrameId: sample.parentFrameId,
    quaternion: [
      sample.rotation.x,
      sample.rotation.y,
      sample.rotation.z,
      sample.rotation.w,
    ],
    timestampNs: sample.timeNs,
    translation: [
      sample.translation.x,
      sample.translation.y,
      sample.translation.z,
    ],
  };
}

function requireLatestState({
  current,
}: {
  readonly current: FrameTransformsState | null;
}): FrameTransformsState {
  if (!current) {
    throw new Error("Expected frame transform state to be published");
  }
  return current;
}

function createFrameTransformClient({
  bootstrapSamples = [],
  readFrameTransformPlacement,
  readFrameTransformWindow,
  windowSamples = [],
}: {
  readonly bootstrapSamples?: readonly EpisodeFrameTransformSample[];
  readonly readFrameTransformPlacement?: FrameTransformClient["readFrameTransformPlacement"];
  readonly readFrameTransformWindow?: FrameTransformClient["readFrameTransformWindow"];
  readonly windowSamples?: readonly EpisodeFrameTransformSample[];
} = {}): FrameTransformClient {
  return {
    readFrameTransformBootstrap: vi.fn(async () => ({
      samples: bootstrapSamples,
    })),
    ...(readFrameTransformPlacement ? { readFrameTransformPlacement } : {}),
    readFrameTransformWindow:
      readFrameTransformWindow ??
      vi.fn(async () => ({
        samples: windowSamples,
      })),
  };
}

interface FrameTransformClient {
  readFrameTransformBootstrap(request: {
    readonly source: ByteSourceDescriptor;
  }): Promise<EpisodeFrameTransformSet>;
  readFrameTransformPlacement?(request: {
    readonly requiredDynamicChildFrameIds: readonly string[];
    readonly timeNs: bigint;
  }): Promise<{
    readonly indexedWindow: {
      readonly endNs: bigint;
      readonly startNs: bigint;
    };
    readonly samples: readonly EpisodeFrameTransformSample[];
  } | null>;
  readFrameTransformWindow(
    request: {
      readonly activeTimeline?: "log";
      readonly endTimeNs: bigint;
      readonly source: ByteSourceDescriptor;
      readonly startTimeNs: bigint;
    },
    options?: { readonly priority?: "bulk" | "current" | "idle" | "playback" },
  ): Promise<EpisodeFrameTransformSet>;
}

function createSource(id: string): ByteSourceDescriptor {
  return {
    sourceId: id,
    url: `memory://${id}.mcap`,
  };
}

function deferred<T>() {
  let resolveDeferred: ((value: T) => void) | undefined;
  let rejectDeferred: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolveDeferred = resolvePromise;
    rejectDeferred = rejectPromise;
  });

  const deferredResolve = (value: T) => {
    resolveDeferred?.(value);
  };
  const deferredReject = (reason?: unknown) => {
    rejectDeferred?.(reason);
  };

  return { promise, reject: deferredReject, resolve: deferredResolve };
}

async function runNextTimer() {
  await act(async () => {
    await vi.runOnlyPendingTimersAsync();
  });
}

async function flushReactWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function sample(
  parentFrameId: string,
  childFrameId: string,
  translation:
    | EpisodeFrameTransformSample["translation"]
    | {
        readonly x: number;
        readonly y: number;
        readonly z: number;
      } = new Vector3(),
  timeNs?: bigint,
): EpisodeFrameTransformSample {
  return {
    childFrameId,
    parentFrameId,
    rotation: new Quaternion(),
    ...(timeNs !== undefined ? { timeNs } : {}),
    translation:
      translation instanceof Vector3
        ? translation
        : new Vector3(translation.x, translation.y, translation.z),
  };
}
