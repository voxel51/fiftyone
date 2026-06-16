import { act, cleanup, render } from "@testing-library/react";
import { StrictMode, useEffect, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ImageAnnotationsVisualization } from "../../../decoders";
import { VISUALIZATION_KIND } from "../../../visualization";
import type { McapDecodedMessage } from "../types";
import {
  McapDataStreamProvider,
  useSetMcapDataStream,
  type McapDataStream,
} from "./mcap-data-stream-context";
import type { McapTimelineIndex } from "./mcap-timeline-index";
import { McapTopicCache } from "./mcap-topic-cache";
import {
  useInterpolatedImageAnnotations,
  useInterpolatedImageAnnotationSets,
} from "./use-interpolated-image-annotations";

// These tests exercise the React/cache lifecycle wiring of the interpolation
// hooks (subscription management + the useSyncExternalStore revision plumbing)
// plus the hook's interpolation seam. The pure interpolation math is covered by
// interpolate-image-annotations.test.
//
// usePlayhead is mocked so the tests are hermetic (no real PlaybackProvider RAF
// engine / shared Jotai store that could leak across tests) and the playhead is
// deterministic and controllable.
const playhead = vi.hoisted(() => ({ seconds: 0 }));
vi.mock("@fiftyone/playback", () => ({
  usePlayhead: () => playhead.seconds,
}));

type AnnotationSets = ReturnType<typeof useInterpolatedImageAnnotationSets>;

afterEach(() => {
  cleanup();
  playhead.seconds = 0;
});

// ---------------------------------------------------------------------------
// Fakes — a real McapTopicCache behind a fake McapDataStream so cache.isActive
// faithfully reports the hook's subscription state, and revision bumps drive
// the external store for real. The stream also tracks the net active
// subscription count so tests can assert exact counts (not just isActive).
// ---------------------------------------------------------------------------

function absBig(n: bigint): bigint {
  return n < 0n ? -n : n;
}

function makeTimeline(ticks: readonly bigint[]): McapTimelineIndex {
  const startTimeNs = ticks[0] ?? 0n;
  const toNs = (sec: number) =>
    startTimeNs + BigInt(Math.round((Number.isFinite(sec) ? sec : 0) * 1e9));
  return {
    ticks,
    durationSec: 1,
    startTimeNs,
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
  caches: Map<string, McapTopicCache>,
  timeline: McapTimelineIndex
) {
  let active = 0;
  const subscribeToTopic = vi.fn((topic: string) => {
    const cache = caches.get(topic);
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
  const stream: McapDataStream = {
    subscribeToTopic,
    getTopicCache: (topic) => caches.get(topic),
    getTimelineIndex: () => timeline,
  };
  return { stream, subscribeToTopic, activeCount: () => active };
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
  position: readonly [number, number]
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
  viz: ImageAnnotationsVisualization
): McapDecodedMessage {
  return {
    timelineTimeNs,
    decoded: { output: { visualization: viz } },
  } as unknown as McapDecodedMessage;
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
  topics,
  interpolate = true,
  onResult,
}: {
  readonly stream: McapDataStream | null;
  readonly topics: readonly string[];
  readonly interpolate?: boolean;
  readonly onResult: (sets: AnnotationSets) => void;
}) {
  const setStream = useSetMcapDataStream();
  // Publish the test stream into context (the provider has no value prop).
  useEffect(() => {
    setStream(stream);
  }, [setStream, stream]);

  const sets = useInterpolatedImageAnnotationSets(topics, { interpolate });
  // Surface the latest derived sets to the test.
  useEffect(() => {
    onResult(sets);
  }, [onResult, sets]);
  return null;
}

function SingleHarness({
  stream,
  topic,
  onResult,
}: {
  readonly stream: McapDataStream | null;
  readonly topic: string;
  readonly onResult: (frame: ImageAnnotationsVisualization | null) => void;
}) {
  const setStream = useSetMcapDataStream();
  useEffect(() => {
    setStream(stream);
  }, [setStream, stream]);

  const frame = useInterpolatedImageAnnotations(topic);
  useEffect(() => {
    onResult(frame);
  }, [onResult, frame]);
  return null;
}

function TestProviders({ children }: { readonly children: ReactNode }) {
  return <McapDataStreamProvider>{children}</McapDataStreamProvider>;
}

const TICKS = [0n, 1_000_000n, 2_000_000n] as const;

// ---------------------------------------------------------------------------

describe("useInterpolatedImageAnnotationSets — subscription lifecycle", () => {
  it("subscribes once per topic on mount and marks caches active", () => {
    const cacheA = new McapTopicCache();
    const cacheB = new McapTopicCache();
    const { stream, subscribeToTopic } = makeStream(
      new Map([
        ["/a", cacheA],
        ["/b", cacheB],
      ]),
      makeTimeline(TICKS)
    );
    const { onResult } = captureResult();

    render(
      <Harness stream={stream} topics={["/a", "/b"]} onResult={onResult} />,
      {
        wrapper: TestProviders,
      }
    );

    expect(subscribeToTopic).toHaveBeenCalledTimes(2);
    expect(subscribeToTopic).toHaveBeenCalledWith("/a");
    expect(subscribeToTopic).toHaveBeenCalledWith("/b");
    expect(cacheA.isActive).toBe(true);
    expect(cacheB.isActive).toBe(true);
  });

  it("unsubscribes every topic on unmount", () => {
    const cacheA = new McapTopicCache();
    const cacheB = new McapTopicCache();
    const { stream } = makeStream(
      new Map([
        ["/a", cacheA],
        ["/b", cacheB],
      ]),
      makeTimeline(TICKS)
    );
    const { onResult } = captureResult();

    const { unmount } = render(
      <Harness stream={stream} topics={["/a", "/b"]} onResult={onResult} />,
      { wrapper: TestProviders }
    );
    expect(cacheA.isActive).toBe(true);

    unmount();

    expect(cacheA.isActive).toBe(false);
    expect(cacheB.isActive).toBe(false);
  });

  it("subscribes when the data stream transitions from null to a real stream", () => {
    const cacheA = new McapTopicCache();
    const { stream, subscribeToTopic } = makeStream(
      new Map([["/a", cacheA]]),
      makeTimeline(TICKS)
    );
    const { onResult, latest } = captureResult();

    const { rerender } = render(
      <Harness stream={null} topics={["/a"]} onResult={onResult} />,
      { wrapper: TestProviders }
    );
    expect(subscribeToTopic).not.toHaveBeenCalled();
    expect(latest()).toEqual([]);

    rerender(<Harness stream={stream} topics={["/a"]} onResult={onResult} />);

    expect(subscribeToTopic).toHaveBeenCalledWith("/a");
    expect(cacheA.isActive).toBe(true);
  });

  it("subscribes only the newly added topic when topics grow", () => {
    const cacheA = new McapTopicCache();
    const cacheB = new McapTopicCache();
    const { stream, subscribeToTopic } = makeStream(
      new Map([
        ["/a", cacheA],
        ["/b", cacheB],
      ]),
      makeTimeline(TICKS)
    );
    const { onResult } = captureResult();

    const { rerender } = render(
      <Harness stream={stream} topics={["/a"]} onResult={onResult} />,
      { wrapper: TestProviders }
    );
    expect(subscribeToTopic).toHaveBeenCalledTimes(1);

    rerender(
      <Harness stream={stream} topics={["/a", "/b"]} onResult={onResult} />
    );

    expect(subscribeToTopic).toHaveBeenCalledWith("/b");
    // "/a" is not re-subscribed.
    expect(
      subscribeToTopic.mock.calls.filter(([t]) => t === "/a")
    ).toHaveLength(1);
    expect(cacheA.isActive).toBe(true);
    expect(cacheB.isActive).toBe(true);
  });

  it("unsubscribes only the dropped topic when topics shrink", () => {
    const cacheA = new McapTopicCache();
    const cacheB = new McapTopicCache();
    const { stream } = makeStream(
      new Map([
        ["/a", cacheA],
        ["/b", cacheB],
      ]),
      makeTimeline(TICKS)
    );
    const { onResult } = captureResult();

    const { rerender } = render(
      <Harness stream={stream} topics={["/a", "/b"]} onResult={onResult} />,
      { wrapper: TestProviders }
    );

    rerender(<Harness stream={stream} topics={["/a"]} onResult={onResult} />);

    expect(cacheA.isActive).toBe(true);
    expect(cacheB.isActive).toBe(false);
  });

  it("does not re-bind subscriptions when an equal-but-new topics array is passed", () => {
    const cacheA = new McapTopicCache();
    // Spying on subscribeToChanges detects external-store churn: if
    // useStableTopics stopped returning a stable identity, the snapshot
    // subscribe callback would change and useSyncExternalStore would re-bind.
    const subscribeToChanges = vi.spyOn(cacheA, "subscribeToChanges");
    const { stream, subscribeToTopic } = makeStream(
      new Map([["/a", cacheA]]),
      makeTimeline(TICKS)
    );
    const { onResult } = captureResult();

    const { rerender } = render(
      <Harness stream={stream} topics={["/a"]} onResult={onResult} />,
      { wrapper: TestProviders }
    );
    const bindingsAfterMount = subscribeToChanges.mock.calls.length;

    rerender(<Harness stream={stream} topics={["/a"]} onResult={onResult} />);

    expect(subscribeToTopic).toHaveBeenCalledTimes(1);
    expect(subscribeToChanges.mock.calls.length).toBe(bindingsAfterMount);
  });

  it("normalizes away empty topics before subscribing", () => {
    const cacheA = new McapTopicCache();
    const { stream, subscribeToTopic } = makeStream(
      new Map([["/a", cacheA]]),
      makeTimeline(TICKS)
    );
    const { onResult } = captureResult();

    render(
      <Harness stream={stream} topics={["/a", ""]} onResult={onResult} />,
      {
        wrapper: TestProviders,
      }
    );

    expect(subscribeToTopic).toHaveBeenCalledTimes(1);
    expect(subscribeToTopic).toHaveBeenCalledWith("/a");
    expect(subscribeToTopic).not.toHaveBeenCalledWith("");
  });

  it("releases the old stream and resubscribes when the data stream is swapped", () => {
    const timeline = makeTimeline(TICKS);
    const streamACache = new McapTopicCache();
    const streamBCache = new McapTopicCache();
    const { stream: streamA, subscribeToTopic: subA } = makeStream(
      new Map([["/a", streamACache]]),
      timeline
    );
    const { stream: streamB, subscribeToTopic: subB } = makeStream(
      new Map([["/a", streamBCache]]),
      timeline
    );
    const { onResult } = captureResult();

    const { rerender } = render(
      <Harness stream={streamA} topics={["/a"]} onResult={onResult} />,
      { wrapper: TestProviders }
    );
    expect(subA).toHaveBeenCalledTimes(1);
    expect(streamACache.isActive).toBe(true);

    rerender(<Harness stream={streamB} topics={["/a"]} onResult={onResult} />);

    expect(streamACache.isActive).toBe(false);
    expect(subB).toHaveBeenCalledWith("/a");
    expect(streamBCache.isActive).toBe(true);
  });

  it("releases subscriptions and returns [] when the stream becomes null", () => {
    const cacheA = new McapTopicCache();
    const { stream } = makeStream(
      new Map([["/a", cacheA]]),
      makeTimeline(TICKS)
    );
    const { onResult, latest } = captureResult();

    const { rerender } = render(
      <Harness stream={stream} topics={["/a"]} onResult={onResult} />,
      { wrapper: TestProviders }
    );
    expect(cacheA.isActive).toBe(true);

    rerender(<Harness stream={null} topics={["/a"]} onResult={onResult} />);

    expect(cacheA.isActive).toBe(false);
    expect(latest()).toEqual([]);
  });
});

describe("useInterpolatedImageAnnotationSets — external-store recompute", () => {
  it("derives a frame when a cache revision bumps in", () => {
    const cacheA = new McapTopicCache();
    const { stream } = makeStream(
      new Map([["/a", cacheA]]),
      makeTimeline(TICKS)
    );
    const { onResult, latest } = captureResult();

    render(<Harness stream={stream} topics={["/a"]} onResult={onResult} />, {
      wrapper: TestProviders,
    });
    expect(latest()).toEqual([]);

    act(() => {
      cacheA.set(TICKS[0], message(TICKS[0], emptyViz()));
    });

    expect(latest()).toHaveLength(1);
    expect(latest()[0].topic).toBe("/a");
    expect(latest()[0].frame.kind).toBe(VISUALIZATION_KIND.IMAGE_ANNOTATIONS);
  });

  it("does not recompute when an unchanged message is re-set (no revision bump)", () => {
    const cacheA = new McapTopicCache();
    const { stream } = makeStream(
      new Map([["/a", cacheA]]),
      makeTimeline(TICKS)
    );
    const { onResult } = captureResult();

    render(<Harness stream={stream} topics={["/a"]} onResult={onResult} />, {
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
    const cacheA = new McapTopicCache();
    const { stream } = makeStream(
      new Map([["/a", cacheA]]),
      makeTimeline(TICKS)
    );
    const { onResult, latest } = captureResult();

    render(<Harness stream={stream} topics={["/a"]} onResult={onResult} />, {
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

  it("re-binds revision subscriptions to the newly watched topic", () => {
    const cacheA = new McapTopicCache();
    const cacheB = new McapTopicCache();
    const { stream } = makeStream(
      new Map([
        ["/a", cacheA],
        ["/b", cacheB],
      ]),
      makeTimeline(TICKS)
    );
    const { onResult, latest } = captureResult();

    const { rerender } = render(
      <Harness stream={stream} topics={["/a"]} onResult={onResult} />,
      { wrapper: TestProviders }
    );

    rerender(<Harness stream={stream} topics={["/b"]} onResult={onResult} />);
    expect(latest()).toEqual([]);

    // A LIVE bump on /b after switching only reaches the hook if the snapshot
    // subscription re-bound to /b's cache.
    act(() => {
      cacheB.set(TICKS[0], message(TICKS[0], emptyViz()));
    });
    expect(latest()).toHaveLength(1);
    expect(latest()[0].topic).toBe("/b");

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
    const cacheA = new McapTopicCache();
    const { stream } = makeStream(
      new Map([["/a", cacheA]]),
      makeTimeline(ticks)
    );
    const { onResult, latest } = captureResult();

    render(<Harness stream={stream} topics={["/a"]} onResult={onResult} />, {
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
    const cacheA = new McapTopicCache();
    const { stream } = makeStream(
      new Map([["/a", cacheA]]),
      makeTimeline(ticks)
    );
    const { onResult, latest } = captureResult();

    render(
      <Harness
        stream={stream}
        topics={["/a"]}
        interpolate={false}
        onResult={onResult}
      />,
      { wrapper: TestProviders }
    );
    act(() => {
      cacheA.set(0n, message(0n, circleViz([0, 0])));
      cacheA.set(2_000_000n, message(2_000_000n, circleViz([100, 0])));
    });

    expect(latest()).toHaveLength(1);
    // current frame at the playhead (nearest tick 0n), no lerp toward [100,0]
    expect(latest()[0].frame.circles[0].position).toEqual([0, 0]);
  });

  it("single-topic wrapper returns the frame or null", () => {
    const cacheA = new McapTopicCache();
    const { stream } = makeStream(
      new Map([["/a", cacheA]]),
      makeTimeline(TICKS)
    );
    const { onResult, latest } = captureFrame();

    render(<SingleHarness stream={stream} topic="/a" onResult={onResult} />, {
      wrapper: TestProviders,
    });
    expect(latest()).toBeNull();

    act(() => {
      cacheA.set(TICKS[0], message(TICKS[0], emptyViz()));
    });
    expect(latest()?.kind).toBe(VISUALIZATION_KIND.IMAGE_ANNOTATIONS);
  });
});

describe("useInterpolatedImageAnnotationSets — StrictMode", () => {
  it("nets to a single subscription on mount and releases it on unmount", () => {
    const cacheA = new McapTopicCache();
    const { stream, activeCount } = makeStream(
      new Map([["/a", cacheA]]),
      makeTimeline(TICKS)
    );
    const { onResult, latest } = captureResult();

    const { unmount } = render(
      <StrictMode>
        <Harness stream={stream} topics={["/a"]} onResult={onResult} />
      </StrictMode>,
      { wrapper: TestProviders }
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
