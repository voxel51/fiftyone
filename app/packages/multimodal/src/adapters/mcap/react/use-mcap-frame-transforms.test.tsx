import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  PlaybackProvider,
  usePlayback,
} from "@fiftyone/playback/src/lib/playback/PlaybackProvider";
import { type ComponentProps, useEffect } from "react";
import { Quaternion, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import type {
  McapFrameTransformSample,
  McapFrameTransformSet,
} from "../frame-transform-types";
import {
  MCAP_ACTIVE_TIMELINE,
  type McapActiveTimeline,
  type McapResourceClient,
} from "../types";
import {
  useMcapFrameTransforms,
  type McapFrameTransformsState,
} from "./use-mcap-frame-transforms";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useMcapFrameTransforms", () => {
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
      expect(client.readFrameTransformWindow).toHaveBeenCalledWith({
        activeTimeline: undefined,
        endTimeNs: 1_000_000_100n,
        source,
        startTimeNs: 0n,
      });
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
        activeTimeline={MCAP_ACTIVE_TIMELINE.LOG}
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
    expect(client.readFrameTransformWindow).toHaveBeenLastCalledWith({
      activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
      endTimeNs: 1_000_000_100n,
      source,
      startTimeNs: 0n,
    });
  });

  it("keeps one in-flight dynamic window when playback advances inside it", async () => {
    const source = createSource("moving-time");
    const windowRead = deferred<McapFrameTransformSet>();
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
    const windowRead = deferred<McapFrameTransformSet>();
    const client = createFrameTransformClient({
      bootstrapSamples: [sample("base_link", "lidar")],
      readFrameTransformWindow: vi.fn(() => windowRead.promise),
    });
    const latestState: { current: McapFrameTransformsState | null } = {
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
  });

  it("treats an indexed no-path placement as definitive missing", async () => {
    const source = createSource("placement-missing");
    const client = createFrameTransformClient({
      bootstrapSamples: [sample("base_link", "lidar")],
      windowSamples: [],
    });
    const latestState: { current: McapFrameTransformsState | null } = {
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
    const latestState: { current: McapFrameTransformsState | null } = {
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

  it("clears surrendered placement windows on an explicit seek", async () => {
    vi.useFakeTimers();
    const source = createSource("retry-seek");
    const client = createFrameTransformClient({
      readFrameTransformWindow: vi.fn(async () => {
        throw new Error("temporary tf failure");
      }),
    });
    const latestState: { current: McapFrameTransformsState | null } = {
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
    await runNextTimer();
    await flushReactWork();
    expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(5);
  });
});

function PlaybackFrameTransformsHarness({
  onPlayback,
  ...props
}: ComponentProps<typeof FrameTransformsHarness> & {
  readonly onPlayback: (playback: ReturnType<typeof usePlayback>) => void;
}) {
  return (
    <PlaybackProvider duration={10} stepInterval={1 / 30}>
      <PlaybackControlsBridge onPlayback={onPlayback} />
      <FrameTransformsHarness {...props} />
    </PlaybackProvider>
  );
}

function PlaybackControlsBridge({
  onPlayback,
}: {
  readonly onPlayback: (playback: ReturnType<typeof usePlayback>) => void;
}) {
  const playback = usePlayback();

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
  source,
  timeNs,
}: {
  readonly activeTimeline?: McapActiveTimeline;
  readonly client: McapResourceClient;
  readonly dynamicRange?: {
    readonly endTimeNs: bigint;
    readonly startTimeNs: bigint;
  } | null;
  readonly label: string;
  readonly onState?: (state: McapFrameTransformsState) => void;
  readonly source: ByteSourceDescriptor | null;
  readonly timeNs?: bigint;
}) {
  const state = useMcapFrameTransforms({
    activeTimeline,
    client,
    dynamicRange,
    source,
    timeNs,
  });
  const resolution = state.resolve("lidar", "base_link", timeNs ?? 0n);

  useEffect(() => {
    onState?.(state);
  }, [onState, state]);

  return (
    <div data-testid={label}>
      {`${state.status}:${resolution.status}:${state.error ?? ""}`}
    </div>
  );
}

function requireLatestState({
  current,
}: {
  readonly current: McapFrameTransformsState | null;
}): McapFrameTransformsState {
  if (!current) {
    throw new Error("Expected frame transform state to be published");
  }
  return current;
}

function createFrameTransformClient({
  bootstrapSamples = [],
  readFrameTransformWindow,
  windowSamples = [],
}: {
  readonly bootstrapSamples?: readonly McapFrameTransformSample[];
  readonly readFrameTransformWindow?: McapResourceClient["readFrameTransformWindow"];
  readonly windowSamples?: readonly McapFrameTransformSample[];
} = {}): McapResourceClient {
  return {
    dispose: vi.fn(),
    readDecodedMessages: vi.fn(async function* () {
      for (const item of [] as never[]) {
        yield item;
      }
    }),
    readFrameTransformBootstrap: vi.fn(async () => ({
      samples: bootstrapSamples,
    })),
    readFrameTransformWindow:
      readFrameTransformWindow ??
      vi.fn(async () => ({
        samples: windowSamples,
      })),
    readSynchronizedMessageBatch: vi.fn(async () => []),
    readRawMessageRecord: vi.fn(),
    readSynchronizedMessages: vi.fn(),
    readTimelineRange: vi.fn(),
    readTopics: vi.fn(async () => []),
    readTopicTimeBounds: vi.fn(async () => []),
    enumerateNumericFields: vi.fn(async () => []),
    readNumericSeries: vi.fn(async () => ({
      baseTimeNs: 0n,
      fields: [],
      messageCount: 0,
      topic: "",
      truncated: false,
    })),
  };
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
    | McapFrameTransformSample["translation"]
    | {
        readonly x: number;
        readonly y: number;
        readonly z: number;
      } = new Vector3(),
  timeNs?: bigint,
): McapFrameTransformSample {
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
