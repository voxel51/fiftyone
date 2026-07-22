import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { PlaybackProvider, usePlayback } from "@fiftyone/playback/runtime";
import { useIsPlayPending } from "@fiftyone/playback/runtime";
import { useEffect, useMemo, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_EPISODE_FRAME_GRAPH_SUMMARY } from "../../../../runtime/frame-transforms";
import { createTimelineIndex } from "../../../../runtime/index";
import {
  EpisodeDataStreamProvider,
  type EpisodeDataStream,
  useEpisodeDataStream,
  useSetEpisodeDataStream,
} from "../../playback/episode-data-stream-context";
import { useEpisode3dPlacementStream } from "./use-episode-3d-placement-stream";
import type {
  EpisodeFramePlacementReadinessStatus,
  EpisodeFrameTransformsState,
} from "../../spatial/frame-transforms/use-episode-frame-transforms";

const TIMELINE = createTimelineIndex({
  endNs: 10_000_000_000n,
  startNs: 0n,
});

const DATA_STREAM: EpisodeDataStream = {
  getTimelineIndex: () => TIMELINE,
  getStreamCache: () => undefined,
  sourceKey: "placement-test",
  subscribeToStream: () => () => undefined,
};

afterEach(cleanup);

describe("useEpisode3dPlacementStream", () => {
  it("does not recursively notify playback while prefetching placement", async () => {
    let playback: ReturnType<typeof usePlayback> | null = null;
    const prefetchPlacement = vi.fn();
    const onPlayback = (next: ReturnType<typeof usePlayback>) => {
      playback = next;
    };

    render(
      <PlaybackProvider duration={10} stepInterval={1 / 30}>
        <EpisodeDataStreamProvider>
          <DataStreamPublisher />
          <PlacementHarness
            onPlayback={onPlayback}
            onPrefetchPlacement={prefetchPlacement}
          />
        </EpisodeDataStreamProvider>
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
  const publish = useSetEpisodeDataStream();

  // This effect provides the placement stream with a concrete episode timeline.
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
  const dataStream = useEpisodeDataStream();
  const isPlayPending = useIsPlayPending();
  const playback = usePlayback();
  const [status, setStatus] =
    useState<EpisodeFramePlacementReadinessStatus>("needsFetch");
  const frameTransforms = useMemo<EpisodeFrameTransformsState>(
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
      summarizeGraph: () => EMPTY_EPISODE_FRAME_GRAPH_SUMMARY,
    }),
    [onPrefetchPlacement, status],
  );
  const readiness = useEpisode3dPlacementStream({
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
