import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  PlaybackProvider,
  usePlayback,
} from "@fiftyone/playback/src/lib/playback/PlaybackProvider";
import { useIsPlayPending } from "@fiftyone/playback/src/lib/playback/use-playback-state";
import { useEffect, useMemo, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_MCAP_FRAME_GRAPH_SUMMARY } from "../frame-transforms";
import { MCAP_ACTIVE_TIMELINE } from "../types";
import {
  McapDataStreamProvider,
  type McapDataStream,
  useMcapDataStream,
  useSetMcapDataStream,
} from "./mcap-data-stream-context";
import { createMcapTimelineIndex } from "./mcap-timeline-index";
import { useMcap3dPlacementStream } from "./use-mcap-3d-placement-stream";
import type {
  McapFramePlacementReadinessStatus,
  McapFrameTransformsState,
} from "./use-mcap-frame-transforms";

const TIMELINE = createMcapTimelineIndex({
  activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
  endTimeNs: 10_000_000_000n,
  startTimeNs: 0n,
});

const DATA_STREAM: McapDataStream = {
  getTimelineIndex: () => TIMELINE,
  getTopicCache: () => undefined,
  sourceKey: "placement-test",
  subscribeToTopic: () => () => undefined,
};

afterEach(cleanup);

describe("useMcap3dPlacementStream", () => {
  it("does not recursively notify playback while prefetching placement", async () => {
    let playback: ReturnType<typeof usePlayback> | null = null;
    const prefetchPlacement = vi.fn();
    const onPlayback = (next: ReturnType<typeof usePlayback>) => {
      playback = next;
    };

    render(
      <PlaybackProvider duration={10} stepInterval={1 / 30}>
        <McapDataStreamProvider>
          <DataStreamPublisher />
          <PlacementHarness
            onPlayback={onPlayback}
            onPrefetchPlacement={prefetchPlacement}
          />
        </McapDataStreamProvider>
      </PlaybackProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("placement-status").textContent).toBe(
        "placement-test:idle:needsFetch",
      );
    });

    await act(async () => {
      playback?.play();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId("placement-status").textContent).toBe(
        "placement-test:pending:loading",
      );
    });
    expect(prefetchPlacement).toHaveBeenCalledWith(0n);
  });
});

function DataStreamPublisher() {
  const publish = useSetMcapDataStream();

  // This effect provides the placement stream with a concrete MCAP timeline.
  useEffect(() => {
    publish(DATA_STREAM);
    return () => publish(null);
  }, [publish]);

  return null;
}

function PlacementHarness({
  onPlayback,
  onPrefetchPlacement,
}: {
  readonly onPlayback: (playback: ReturnType<typeof usePlayback>) => void;
  readonly onPrefetchPlacement: (timeNs: bigint) => void;
}) {
  const dataStream = useMcapDataStream();
  const isPlayPending = useIsPlayPending();
  const playback = usePlayback();
  const [status, setStatus] =
    useState<McapFramePlacementReadinessStatus>("needsFetch");
  const frameTransforms = useMemo<McapFrameTransformsState>(
    () => ({
      error: null,
      frameIds: ["lidar"],
      getPlacementReadiness: ({ frameIds }) => ({ frameIds, status }),
      indexedDynamicRanges: () => [],
      prefetchPlacement: (timeNs) => {
        onPrefetchPlacement(timeNs);
        setStatus("loading");
      },
      resolve: (sourceFrameId, targetFrameId) => ({
        sourceFrameId,
        status: "missing",
        targetFrameId,
      }),
      status: "ready",
      summarizeGraph: () => EMPTY_MCAP_FRAME_GRAPH_SUMMARY,
    }),
    [onPrefetchPlacement, status],
  );
  const readiness = useMcap3dPlacementStream({
    active: true,
    frameIds: ["lidar"],
    frameTransforms,
    playbackTimeNs: 0n,
    streamId: "placement",
    worldFrameId: "map",
  });

  // This effect exposes playback controls to the test after the provider mounts.
  useEffect(() => {
    onPlayback(playback);
  }, [onPlayback, playback]);

  return (
    <div data-testid="placement-status">
      {`${dataStream?.sourceKey ?? "none"}:${
        isPlayPending ? "pending" : "idle"
      }:${readiness.status}`}
    </div>
  );
}
