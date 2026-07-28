import { act, cleanup, render } from "@testing-library/react";
import { StrictMode, useEffect, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ImageAnnotationsVisualization } from "../../../ir";
import { VISUALIZATION_KIND } from "../../../visualization";
import type { DecodedFrame } from "../../../ir";
import type { TimelineIndex } from "../../../runtime";
import {
  DataStreamProvider,
  useSetDataStream,
  type DataStream,
} from "../playback/data-stream-context";
import { EpisodeStreamCache } from "../../../runtime";
import { nextDistinctCachedMessage } from "../playback/cache-sampling";
import {
  preparedImageAnnotationInterpolation,
  useInterpolatedImageAnnotations,
  useInterpolatedImageAnnotationSets,
} from "./use-interpolated-image-annotations";

// These tests exercise the React/cache lifecycle wiring of the interpolation
// hooks (subscription management + the useSyncExternalStore revision plumbing)
// plus the hook's interpolation seam. The pure interpolation math is covered by
// interpolate-image-annotations.test.
//
// The optional playhead surface is mocked so the tests are hermetic (no real
// PlaybackProvider RAF engine / shared Jotai store that could leak across
// tests) and the playhead is deterministic and controllable.
const playhead = vi.hoisted(() => ({ seconds: 0 }));
vi.mock("../playback/use-optional-playhead", () => ({
  useOptionalPlayhead: () => playhead.seconds,
}));

type AnnotationSets = ReturnType<typeof useInterpolatedImageAnnotationSets>;

afterEach(() => {
  cleanup();
  playhead.seconds = 0;
});

// ---------------------------------------------------------------------------
// Fakes — a real EpisodeStreamCache behind a fake DataStream so cache.isActive
// faithfully reports the hook's subscription state, and revision bumps drive
// the external store for real. The stream also tracks the net active
// subscription count so tests can assert exact counts (not just isActive).
// ---------------------------------------------------------------------------

function absBig(n: bigint): bigint {
  return n < 0n ? -n : n;
}

function makeTimeline(ticks: readonly bigint[]): TimelineIndex {
  const startTimeNs = ticks[0] ?? 0n;
  const stepNs =
    ticks.length > 1 ? (ticks[1] as bigint) - startTimeNs : 1_000_000n;
  const toNs = (sec: number) =>
    startTimeNs + BigInt(Math.round((Number.isFinite(sec) ? sec : 0) * 1e9));
  const lowerBound = (target: bigint): number => {
    let lo = 0;
    let hi = ticks.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((ticks[mid] as bigint) < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return {
    durationSec: 1,
    endTimeNs: ticks.at(-1) ?? startTimeNs,
    indexAtOrAfter: lowerBound,
    indexOfTick: (tick) => {
      const index = ticks.indexOf(tick);
      return index === -1 ? undefined : index;
    },
    nsToSec: (timeNs) => Number(timeNs - startTimeNs) / 1e9,
    startTimeNs,
    stepNs,
    tickAt: (index) => ticks[index],
    tickRateHz: 1_000_000_000 / Number(stepNs),
    tickCount: ticks.length,
    secToNs: toNs,
    nearestTick: (sec) => {
      if (ticks.length === 0) return undefined;
      const target = toNs(sec);
      let best = ticks[0];
      let bestDiff = absBig(target - best);
      for (const t of ticks) {
        const diff = absBig(target - t);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = t;
        }
      }
      return best;
    },
  };
}

function makeStream(
  caches: Map<string, EpisodeStreamCache>,
  timeline: TimelineIndex,
) {
  let active = 0;
  const subscribeToStream = vi.fn((stream: string) => {
    const cache = caches.get(stream);
    const release = cache ? cache.subscribe() : () => undefined;
    active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      active -= 1;
      release();
    };
  });
  const stream: DataStream = {
    sourceKey: "test-source",
    subscribeToStream,
    getStreamCache: (stream) => caches.get(stream),
    getTimelineIndex: () => timeline,
  };
  return { stream, subscribeToStream, activeCount: () => active };
}

function emptyViz(): ImageAnnotationsVisualization {
  return {
    kind: VISUALIZATION_KIND.IMAGE_ANNOTATIONS,
    circles: [],
    points: [],
    texts: [],
  };
}

function circleViz(
  position: readonly [number, number],
): ImageAnnotationsVisualization {
  return {
    kind: VISUALIZATION_KIND.IMAGE_ANNOTATIONS,
    circles: [
      {
        position,
        diameter: 4,
        thickness: 1,
        outlineColor: null,
        fillColor: null,
      },
    ],
    points: [],
    texts: [],
  };
}

function message(
  timelineTimeNs: bigint,
  viz: ImageAnnotationsVisualization,
): DecodedFrame {
  return {
    output: { visualization: viz },
    streamId: "annotations",
    timestampNs: timelineTimeNs,
  } as unknown as DecodedFrame;
}

function captureResult() {
  let latest: AnnotationSets = [];
  const onResult = vi.fn((sets: AnnotationSets) => {
    latest = sets;
  });
  return { onResult, latest: () => latest };
}

function captureFrame() {
  let latest: ImageAnnotationsVisualization | null = null;
  const onResult = vi.fn((frame: ImageAnnotationsVisualization | null) => {
    latest = frame;
  });
  return { onResult, latest: () => latest };
}

function Harness({
  stream,
  streams,
  interpolate = true,
  onResult,
}: {
  readonly stream: DataStream | null;
  readonly streams: readonly string[];
  readonly interpolate?: boolean;
  readonly onResult: (sets: AnnotationSets) => void;
}) {
  const setStream = useSetDataStream();
  // This effect publishes the test stream into context.
  useEffect(() => {
    setStream(stream);
  }, [setStream, stream]);

  const sets = useInterpolatedImageAnnotationSets(streams, { interpolate });
  // This effect surfaces the latest derived annotation sets to the test.
  useEffect(() => {
    onResult(sets);
  }, [onResult, sets]);
  return null;
}

function SingleHarness({
  stream,
  streamId,
  onResult,
}: {
  readonly stream: DataStream | null;
  readonly streamId: string;
  readonly onResult: (frame: ImageAnnotationsVisualization | null) => void;
}) {
  const setStream = useSetDataStream();
  // This effect publishes the test stream into context.
  useEffect(() => {
    setStream(stream);
  }, [setStream, stream]);

  const frame = useInterpolatedImageAnnotations(streamId);
  // This effect surfaces the latest derived annotation frame to the test.
  useEffect(() => {
    onResult(frame);
  }, [onResult, frame]);
  return null;
}

function TestProviders({ children }: { readonly children: ReactNode }) {
  return <DataStreamProvider>{children}</DataStreamProvider>;
}

const TICKS = [0n, 1_000_000n, 2_000_000n] as const;

// ---------------------------------------------------------------------------

describe("useInterpolatedImageAnnotationSets — subscription lifecycle", () => {
  it("subscribes once per stream on mount and marks caches active", () => {
    const cacheA = new EpisodeStreamCache();
    const cacheB = new EpisodeStreamCache();
    const { stream, subscribeToStream } = makeStream(
      new Map([
        ["/a", cacheA],
        ["/b", cacheB],
      ]),
      makeTimeline(TICKS),
    );
    const { onResult } = captureResult();

    render(
      <Harness stream={stream} streams={["/a", "/b"]} onResult={onResult} />,
      {
        wrapper: TestProviders,
      },
    );

    expect(subscribeToStream).toHaveBeenCalledTimes(2);
    expect(subscribeToStream).toHaveBeenCalledWith("/a");
    expect(subscribeToStream).toHaveBeenCalledWith("/b");
    expect(cacheA.isActive).toBe(true);
    expect(cacheB.isActive).toBe(true);
  });

  it("unsubscribes every stream on unmount", () => {
    const cacheA = new EpisodeStreamCache();
    const cacheB = new EpisodeStreamCache();
    const { stream } = makeStream(
      new Map([
        ["/a", cacheA],
        ["/b", cacheB],
      ]),
      makeTimeline(TICKS),
    );
    const { onResult } = captureResult();

    const { unmount } = render(
      <Harness stream={stream} streams={["/a", "/b"]} onResult={onResult} />,
      { wrapper: TestProviders },
    );
    expect(cacheA.isActive).toBe(true);

    unmount();

    expect(cacheA.isActive).toBe(false);
    expect(cacheB.isActive).toBe(false);
  });

  it("subscribes when the data stream transitions from null to a real stream", () => {
    const cacheA = new EpisodeStreamCache();
    const { stream, subscribeToStream } = makeStream(
      new Map([["/a", cacheA]]),
      makeTimeline(TICKS),
    );
    const { onResult, latest } = captureResult();

    const { rerender } = render(
      <Harness stream={null} streams={["/a"]} onResult={onResult} />,
      { wrapper: TestProviders },
    );
    expect(subscribeToStream).not.toHaveBeenCalled();
    expect(latest()).toEqual([]);

    rerender(<Harness stream={stream} streams={["/a"]} onResult={onResult} />);

    expect(subscribeToStream).toHaveBeenCalledWith("/a");
    expect(cacheA.isActive).toBe(true);
  });

  it("subscribes only the newly added stream when streams grow", () => {
    const cacheA = new EpisodeStreamCache();
    const cacheB = new EpisodeStreamCache();
    const { stream, subscribeToStream } = makeStream(
      new Map([
        ["/a", cacheA],
        ["/b", cacheB],
      ]),
      makeTimeline(TICKS),
    );
    const { onResult } = captureResult();

    const { rerender } = render(
      <Harness stream={stream} streams={["/a"]} onResult={onResult} />,
      { wrapper: TestProviders },
    );
    expect(subscribeToStream).toHaveBeenCalledTimes(1);

    rerender(
      <Harness stream={stream} streams={["/a", "/b"]} onResult={onResult} />,
    );

    expect(subscribeToStream).toHaveBeenCalledWith("/b");
    // "/a" is not re-subscribed.
    expect(
      subscribeToStream.mock.calls.filter(([t]) => t === "/a"),
    ).toHaveLength(1);
    expect(cacheA.isActive).toBe(true);
    expect(cacheB.isActive).toBe(true);
  });

  it("unsubscribes only the dropped stream when streams shrink", () => {
    const cacheA = new EpisodeStreamCache();
    const cacheB = new EpisodeStreamCache();
    const { stream } = makeStream(
      new Map([
        ["/a", cacheA],
        ["/b", cacheB],
      ]),
      makeTimeline(TICKS),
    );
    const { onResult } = captureResult();

    const { rerender } = render(
      <Harness stream={stream} streams={["/a", "/b"]} onResult={onResult} />,
      { wrapper: TestProviders },
    );

    rerender(<Harness stream={stream} streams={["/a"]} onResult={onResult} />);

    expect(cacheA.isActive).toBe(true);
    expect(cacheB.isActive).toBe(false);
  });

  it("does not re-bind subscriptions when an equal-but-new streams array is passed", () => {
    const cacheA = new EpisodeStreamCache();
    // Spying on subscribeToChanges detects external-store churn: if
    // useStableStreams stopped returning a stable identity, the snapshot
    // subscribe callback would change and useSyncExternalStore would re-bind.
    const subscribeToChanges = vi.spyOn(cacheA, "subscribeToChanges");
    const { stream, subscribeToStream } = makeStream(
      new Map([["/a", cacheA]]),
      makeTimeline(TICKS),
    );
    const { onResult } = captureResult();

    const { rerender } = render(
      <Harness stream={stream} streams={["/a"]} onResult={onResult} />,
      { wrapper: TestProviders },
    );
    const bindingsAfterMount = subscribeToChanges.mock.calls.length;

    rerender(<Harness stream={stream} streams={["/a"]} onResult={onResult} />);

    expect(subscribeToStream).toHaveBeenCalledTimes(1);
    expect(subscribeToChanges.mock.calls.length).toBe(bindingsAfterMount);
  });

  it("normalizes away empty streams before subscribing", () => {
    const cacheA = new EpisodeStreamCache();
    const { stream, subscribeToStream } = makeStream(
      new Map([["/a", cacheA]]),
      makeTimeline(TICKS),
    );
    const { onResult } = captureResult();

    render(
      <Harness stream={stream} streams={["/a", ""]} onResult={onResult} />,
      {
        wrapper: TestProviders,
      },
    );

    expect(subscribeToStream).toHaveBeenCalledTimes(1);
    expect(subscribeToStream).toHaveBeenCalledWith("/a");
    expect(subscribeToStream).not.toHaveBeenCalledWith("");
  });

  it("deduplicates streams before subscribing", () => {
    const cacheA = new EpisodeStreamCache();
    const cacheB = new EpisodeStreamCache();
    const { stream, subscribeToStream } = makeStream(
      new Map([
        ["/a", cacheA],
        ["/b", cacheB],
      ]),
      makeTimeline(TICKS),
    );
    const { onResult } = captureResult();

    render(
      <Harness
        stream={stream}
        streams={["/a", "/b", "/a"]}
        onResult={onResult}
      />,
      {
        wrapper: TestProviders,
      },
    );

    expect(subscribeToStream).toHaveBeenCalledTimes(2);
    expect(subscribeToStream).toHaveBeenCalledWith("/a");
    expect(subscribeToStream).toHaveBeenCalledWith("/b");
  });

  it("releases the old stream and resubscribes when the data stream is swapped", () => {
    const timeline = makeTimeline(TICKS);
    const streamACache = new EpisodeStreamCache();
    const streamBCache = new EpisodeStreamCache();
    const { stream: streamA, subscribeToStream: subA } = makeStream(
      new Map([["/a", streamACache]]),
      timeline,
    );
    const { stream: streamB, subscribeToStream: subB } = makeStream(
      new Map([["/a", streamBCache]]),
      timeline,
    );
    const { onResult } = captureResult();

    const { rerender } = render(
      <Harness stream={streamA} streams={["/a"]} onResult={onResult} />,
      { wrapper: TestProviders },
    );
    expect(subA).toHaveBeenCalledTimes(1);
    expect(streamACache.isActive).toBe(true);

    rerender(<Harness stream={streamB} streams={["/a"]} onResult={onResult} />);

    expect(streamACache.isActive).toBe(false);
    expect(subB).toHaveBeenCalledWith("/a");
    expect(streamBCache.isActive).toBe(true);
  });

  it("releases subscriptions and returns [] when the stream becomes null", () => {
    const cacheA = new EpisodeStreamCache();
    const { stream } = makeStream(
      new Map([["/a", cacheA]]),
      makeTimeline(TICKS),
    );
    const { onResult, latest } = captureResult();

    const { rerender } = render(
      <Harness stream={stream} streams={["/a"]} onResult={onResult} />,
      { wrapper: TestProviders },
    );
    expect(cacheA.isActive).toBe(true);

    rerender(<Harness stream={null} streams={["/a"]} onResult={onResult} />);

    expect(cacheA.isActive).toBe(false);
    expect(latest()).toEqual([]);
  });
});

describe("useInterpolatedImageAnnotationSets — external-store recompute", () => {
  it("derives a frame when a cache revision bumps in", () => {
    const cacheA = new EpisodeStreamCache();
    const { stream } = makeStream(
      new Map([["/a", cacheA]]),
      makeTimeline(TICKS),
    );
    const { onResult, latest } = captureResult();

    render(<Harness stream={stream} streams={["/a"]} onResult={onResult} />, {
      wrapper: TestProviders,
    });
    expect(latest()).toEqual([]);

    act(() => {
      cacheA.set(TICKS[0], message(TICKS[0], emptyViz()));
    });

    expect(latest()).toHaveLength(1);
    expect(latest()[0].stream).toBe("/a");
    expect(latest()[0].frame.kind).toBe(VISUALIZATION_KIND.IMAGE_ANNOTATIONS);
  });

  it("does not recompute when an unchanged message is re-set (no revision bump)", () => {
    const cacheA = new EpisodeStreamCache();
    const { stream } = makeStream(
      new Map([["/a", cacheA]]),
      makeTimeline(TICKS),
    );
    const { onResult } = captureResult();

    render(<Harness stream={stream} streams={["/a"]} onResult={onResult} />, {
      wrapper: TestProviders,
    });
    const msg = message(TICKS[0], emptyViz());
    act(() => {
      cacheA.set(TICKS[0], msg);
    });

    const callsAfterFirstSet = onResult.mock.calls.length;
    act(() => {
      cacheA.set(TICKS[0], msg); // identical object -> no bump -> no re-render
    });
    expect(onResult.mock.calls.length).toBe(callsAfterFirstSet);
  });

  it("recomputes to empty when the cache is cleared", () => {
    const cacheA = new EpisodeStreamCache();
    const { stream } = makeStream(
      new Map([["/a", cacheA]]),
      makeTimeline(TICKS),
    );
    const { onResult, latest } = captureResult();

    render(<Harness stream={stream} streams={["/a"]} onResult={onResult} />, {
      wrapper: TestProviders,
    });
    act(() => {
      cacheA.set(TICKS[0], message(TICKS[0], emptyViz()));
    });
    expect(latest()).toHaveLength(1);

    act(() => {
      cacheA.clear();
    });
    expect(latest()).toEqual([]);
  });

  it("re-binds revision subscriptions to the newly watched stream", () => {
    const cacheA = new EpisodeStreamCache();
    const cacheB = new EpisodeStreamCache();
    const { stream } = makeStream(
      new Map([
        ["/a", cacheA],
        ["/b", cacheB],
      ]),
      makeTimeline(TICKS),
    );
    const { onResult, latest } = captureResult();

    const { rerender } = render(
      <Harness stream={stream} streams={["/a"]} onResult={onResult} />,
      { wrapper: TestProviders },
    );

    rerender(<Harness stream={stream} streams={["/b"]} onResult={onResult} />);
    expect(latest()).toEqual([]);

    // A LIVE bump on /b after switching only reaches the hook if the snapshot
    // subscription re-bound to /b's cache.
    act(() => {
      cacheB.set(TICKS[0], message(TICKS[0], emptyViz()));
    });
    expect(latest()).toHaveLength(1);
    expect(latest()[0].stream).toBe("/b");

    // A bump on /a (no longer watched) must NOT reach the hook — its binding
    // was released.
    const callsBeforeStaleBump = onResult.mock.calls.length;
    act(() => {
      cacheA.set(TICKS[0], message(TICKS[0], emptyViz()));
    });
    expect(onResult.mock.calls.length).toBe(callsBeforeStaleBump);
  });
});

describe("useInterpolatedImageAnnotationSets — interpolation seam", () => {
  it("interpolates between the surrounding cached messages at the playhead", () => {
    const ticks = [0n, 1_000_000n, 2_000_000n];
    // playhead 0.0005s -> 500_000ns -> fraction 0.25 between tick 0n and 2_000_000n
    playhead.seconds = 0.0005;
    const cacheA = new EpisodeStreamCache();
    const { stream } = makeStream(
      new Map([["/a", cacheA]]),
      makeTimeline(ticks),
    );
    const { onResult, latest } = captureResult();

    render(<Harness stream={stream} streams={["/a"]} onResult={onResult} />, {
      wrapper: TestProviders,
    });
    act(() => {
      cacheA.set(0n, message(0n, circleViz([0, 0])));
      cacheA.set(2_000_000n, message(2_000_000n, circleViz([100, 0])));
    });

    expect(latest()).toHaveLength(1);
    // lerp([0,0] -> [100,0], 0.25) === [25, 0]
    expect(latest()[0].frame.circles[0].position).toEqual([25, 0]);
  });

  it("returns the current frame without lerping when interpolate is false", () => {
    const ticks = [0n, 1_000_000n, 2_000_000n];
    playhead.seconds = 0.0005;
    const cacheA = new EpisodeStreamCache();
    const { stream } = makeStream(
      new Map([["/a", cacheA]]),
      makeTimeline(ticks),
    );
    const { onResult, latest } = captureResult();

    render(
      <Harness
        stream={stream}
        streams={["/a"]}
        interpolate={false}
        onResult={onResult}
      />,
      { wrapper: TestProviders },
    );
    act(() => {
      cacheA.set(0n, message(0n, circleViz([0, 0])));
      cacheA.set(2_000_000n, message(2_000_000n, circleViz([100, 0])));
    });

    expect(latest()).toHaveLength(1);
    // current frame at the playhead (nearest tick 0n), no lerp toward [100,0]
    expect(latest()[0].frame.circles[0].position).toEqual([0, 0]);
  });

  it("single-stream wrapper returns the frame or null", () => {
    const cacheA = new EpisodeStreamCache();
    const { stream } = makeStream(
      new Map([["/a", cacheA]]),
      makeTimeline(TICKS),
    );
    const { onResult, latest } = captureFrame();

    render(
      <SingleHarness stream={stream} streamId="/a" onResult={onResult} />,
      { wrapper: TestProviders },
    );
    expect(latest()).toBeNull();

    act(() => {
      cacheA.set(TICKS[0], message(TICKS[0], emptyViz()));
    });
    expect(latest()?.kind).toBe(VISUALIZATION_KIND.IMAGE_ANNOTATIONS);
  });
});

describe("image annotation interpolation caches", () => {
  it("reuses the prepared plan only for the same visualization pair", () => {
    const cache = new WeakMap() as Parameters<
      typeof preparedImageAnnotationInterpolation
    >[0];
    const previous = circleViz([0, 0]);
    const next = circleViz([10, 0]);

    const first = preparedImageAnnotationInterpolation(cache, previous, next);
    const second = preparedImageAnnotationInterpolation(cache, previous, next);
    const differentPair = preparedImageAnnotationInterpolation(
      cache,
      previous,
      circleViz([20, 0]),
    );

    expect(second).toBe(first);
    expect(differentPair).not.toBe(first);
  });

  it("reuses a positive next-message lookup while the pair remains current", () => {
    const ticks = Array.from(
      { length: 130 },
      (_, index) => BigInt(index) * 33_333_333n,
    );
    const timeline = makeTimeline(ticks);
    const cache = new EpisodeStreamCache();
    const current = message(0n, emptyViz());
    const next = message(ticks[125], emptyViz());
    cache.set(ticks[6], current);
    cache.set(ticks[125], next);
    const lookupCache = new WeakMap();

    expect(
      nextDistinctCachedMessage({
        cache,
        currentMessage: current,
        currentTick: ticks[6],
        currentTimelineTimeNs: 0n,
        lookupCache,
        timeline,
      }),
    ).toBe(next);

    const get = vi.spyOn(cache, "get");
    expect(
      nextDistinctCachedMessage({
        cache,
        currentMessage: current,
        currentTick: ticks[7],
        currentTimelineTimeNs: 0n,
        lookupCache,
        timeline,
      }),
    ).toBe(next);
    expect(get).not.toHaveBeenCalled();
  });

  it("rescans a cached miss as its bounded window advances", () => {
    const ticks = Array.from(
      { length: 130 },
      (_, index) => BigInt(index) * 33_333_333n,
    );
    const timeline = makeTimeline(ticks);
    const cache = new EpisodeStreamCache();
    const current = message(0n, emptyViz());
    const next = message(ticks[125], emptyViz());
    cache.set(ticks[0], current);
    cache.set(ticks[6], current);
    cache.set(ticks[125], next);
    const lookupCache = new WeakMap();

    expect(
      nextDistinctCachedMessage({
        cache,
        currentMessage: current,
        currentTick: ticks[0],
        currentTimelineTimeNs: 0n,
        lookupCache,
        timeline,
      }),
    ).toBeNull();
    expect(
      nextDistinctCachedMessage({
        cache,
        currentMessage: current,
        currentTick: ticks[6],
        currentTimelineTimeNs: 0n,
        lookupCache,
        timeline,
      }),
    ).toBe(next);
  });

  it("invalidates a cached miss when late lookahead arrives", () => {
    const timeline = makeTimeline(TICKS);
    const cache = new EpisodeStreamCache();
    const current = message(TICKS[0], emptyViz());
    const next = message(TICKS[2], emptyViz());
    cache.set(TICKS[0], current);
    const lookupCache = new WeakMap();
    const lookup = () =>
      nextDistinctCachedMessage({
        cache,
        currentMessage: current,
        currentTick: TICKS[0],
        currentTimelineTimeNs: current.timestampNs,
        lookupCache,
        timeline,
      });

    expect(lookup()).toBeNull();
    cache.set(TICKS[2], next);
    expect(lookup()).toBe(next);
  });

  it("replaces a cached positive lookup when earlier lookahead arrives", () => {
    const ticks = [0n, 1n, 2n, 3n, 4n];
    const timeline = makeTimeline(ticks);
    const cache = new EpisodeStreamCache();
    const current = message(0n, emptyViz());
    const later = message(4n, circleViz([40, 0]));
    const earlier = message(2n, circleViz([20, 0]));
    cache.set(0n, current);
    cache.set(4n, later);
    const lookupCache = new WeakMap();
    const lookup = () =>
      nextDistinctCachedMessage({
        cache,
        currentMessage: current,
        currentTick: 0n,
        currentTimelineTimeNs: current.timestampNs,
        lookupCache,
        timeline,
      });

    expect(lookup()).toBe(later);
    cache.set(2n, earlier);
    expect(lookup()).toBe(earlier);
  });
});

describe("useInterpolatedImageAnnotationSets — StrictMode", () => {
  it("nets to a single subscription on mount and releases it on unmount", () => {
    const cacheA = new EpisodeStreamCache();
    const { stream, activeCount } = makeStream(
      new Map([["/a", cacheA]]),
      makeTimeline(TICKS),
    );
    const { onResult, latest } = captureResult();

    const { unmount } = render(
      <StrictMode>
        <Harness stream={stream} streams={["/a"]} onResult={onResult} />
      </StrictMode>,
      { wrapper: TestProviders },
    );

    // Double-invoked effects must net to EXACTLY one active subscription, not
    // two (isActive alone would not distinguish a leak).
    expect(activeCount()).toBe(1);
    expect(cacheA.isActive).toBe(true);

    act(() => {
      cacheA.set(TICKS[0], message(TICKS[0], emptyViz()));
    });
    expect(latest()).toHaveLength(1);

    unmount();
    expect(activeCount()).toBe(0);
    expect(cacheA.isActive).toBe(false);
  });
});
