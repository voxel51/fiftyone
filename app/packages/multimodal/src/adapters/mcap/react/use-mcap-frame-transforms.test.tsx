import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
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
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("frames").textContent).toBe("ready:resolved:");
    });
    await waitFor(() => {
      expect(onState).toHaveBeenLastCalledWith(
        expect.objectContaining({
          frameIds: ["base_link", "lidar"],
        })
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
      />
    );

    await waitFor(() => {
      expect(client.readFrameTransformWindow).toHaveBeenCalledWith({
        activeTimeline: undefined,
        endTimeNs: 500_000_100n,
        source,
        startTimeNs: 0n,
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId("frames").textContent).toBe("ready:resolved:");
    });
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
      />
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
      />
    );

    await waitFor(() => {
      expect(client.readFrameTransformBootstrap).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(2);
    });
    expect(client.readFrameTransformWindow).toHaveBeenLastCalledWith({
      activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
      endTimeNs: 500_000_100n,
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
      />
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
      />
    );
    expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(1);

    windowRead.resolve({
      samples: [sample("base_link", "lidar", undefined, 100n)],
    });

    await waitFor(() => {
      expect(screen.getByTestId("frames").textContent).toBe("ready:resolved:");
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

    const { rerender } = render(
      <FrameTransformsHarness
        client={client}
        label="frames"
        source={source}
        timeNs={100n}
      />
    );

    await flushReactWork();
    expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("frames").textContent).toBe(
      "ready:pending:temporary tf failure"
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

    rerender(
      <FrameTransformsHarness
        client={client}
        label="frames"
        source={source}
        timeNs={200n}
      />
    );

    await flushReactWork();
    expect(client.readFrameTransformWindow).toHaveBeenCalledTimes(5);
  });
});

function FrameTransformsHarness({
  activeTimeline,
  client,
  label,
  onState,
  source,
  timeNs,
}: {
  readonly activeTimeline?: McapActiveTimeline;
  readonly client: McapResourceClient;
  readonly label: string;
  readonly onState?: (state: McapFrameTransformsState) => void;
  readonly source: ByteSourceDescriptor | null;
  readonly timeNs?: bigint;
}) {
  const state = useMcapFrameTransforms({
    activeTimeline,
    client,
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
    readSynchronizedMessages: vi.fn(),
    readTimelineRange: vi.fn(),
    readTopics: vi.fn(async () => []),
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
  timeNs?: bigint
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
