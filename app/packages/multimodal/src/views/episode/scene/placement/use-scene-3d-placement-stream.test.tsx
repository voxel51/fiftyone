import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  PlaybackProvider,
  useBufferingDetail,
  usePlayback,
} from "@fiftyone/playback/runtime";
import { useIsPlayPending } from "@fiftyone/playback/runtime";
import { useIsPlaying } from "@fiftyone/playback/runtime";
import { useEffect, useMemo, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  setEpisodeBufferCostObserver,
  type EpisodeBufferCostObservation,
} from "../../../../observability/episode-buffer-cost";
import { EMPTY_EPISODE_FRAME_GRAPH_SUMMARY } from "../../../../runtime/frame-transforms";
import { createTimelineIndex } from "../../../../runtime/index";
import {
  DataStreamProvider,
  type DataStream,
  useDataStream,
  useSetDataStream,
} from "../../playback/data-stream-context";
import {
  SCENE_3D_PLACEMENT_BUFFERING_DETAIL,
  useScene3dPlacementStream,
} from "./use-scene-3d-placement-stream";
import type {
  FramePlacementScope,
  FramePlacementReadinessStatus,
  FrameTransformsState,
} from "../../spatial/frame-transforms/use-frame-transforms";

const TIMELINE = createTimelineIndex({
  endNs: 10_000_000_000n,
  startNs: 0n,
});

const DATA_STREAM: DataStream = {
  getTimelineIndex: () => TIMELINE,
  getStreamCache: () => undefined,
  sourceKey: "placement-test",
  subscribeToStream: () => () => undefined,
};

afterEach(cleanup);

describe("useScene3dPlacementStream", () => {
  it("does not recursively notify playback while prefetching placement", async () => {
    let playback: ReturnType<typeof usePlayback> | null = null;
    const prefetchPlacement = vi.fn();
    const onPlayback = (next: ReturnType<typeof usePlayback>) => {
      playback = next;
    };

    render(
      <PlaybackProvider duration={10} stepInterval={1 / 30}>
        <DataStreamProvider>
          <DataStreamPublisher />
          <PlacementHarness
            onPlayback={onPlayback}
            onPrefetchPlacement={prefetchPlacement}
          />
        </DataStreamProvider>
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
    expect(prefetchPlacement).toHaveBeenCalledWith(0n, {
      frameIds: ["lidar"],
      targetFrameId: "map",
    });
  });

  it("keeps Play pending with an explicit detail until startup runway is covered", async () => {
    let playback: ReturnType<typeof usePlayback> | null = null;
    const prefetchPlacement = vi.fn();

    render(
      <PlaybackProvider duration={10} stepInterval={1 / 30}>
        <DataStreamProvider>
          <DataStreamPublisher />
          <PlacementHarness
            indexedRanges={[{ endTimeNs: 0n, startTimeNs: 0n }]}
            initialStatus="ready"
            markLoadingOnPrefetch={false}
            onPlayback={(next) => {
              playback = next;
            }}
            onPrefetchPlacement={prefetchPlacement}
          />
        </DataStreamProvider>
      </PlaybackProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("placement-status").textContent).toBe(
        "placement-test:idle:ready",
      );
    });
    act(() => playback?.play());

    await waitFor(() => {
      expect(screen.getByTestId("placement-status").textContent).toBe(
        "placement-test:pending:ready",
      );
      expect(screen.getByTestId("buffering-detail").textContent).toBe(
        SCENE_3D_PLACEMENT_BUFFERING_DETAIL,
      );
    });
    expect(prefetchPlacement).toHaveBeenCalledWith(0n, {
      frameIds: ["lidar"],
      targetFrameId: "map",
    });
  });

  it("starts static-only placement without waiting for runway", async () => {
    let playback: ReturnType<typeof usePlayback> | null = null;
    const prefetchPlacement = vi.fn();

    render(
      <PlaybackProvider duration={10} stepInterval={1 / 30}>
        <DataStreamProvider>
          <DataStreamPublisher />
          <PlacementHarness
            initialStatus="ready"
            markLoadingOnPrefetch={false}
            onPlayback={(next) => {
              playback = next;
            }}
            onPrefetchPlacement={prefetchPlacement}
          />
        </DataStreamProvider>
      </PlaybackProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("placement-status").textContent).toBe(
        "placement-test:idle:ready",
      );
    });
    act(() => playback?.play());

    await waitFor(() => {
      expect(screen.getByTestId("playback-playing").textContent).toBe("yes");
    });
    expect(prefetchPlacement).not.toHaveBeenCalled();
  });
});

function DataStreamPublisher() {
  const publish = useSetDataStream();

  // This effect provides the placement stream with a concrete episode timeline.
  useEffect(() => {
    publish(DATA_STREAM);
    return () => publish(null);
  }, [publish]);

  return null;
}

function PlacementHarness({
  indexedRanges = [],
  initialStatus = "needsFetch",
  markLoadingOnPrefetch = true,
  onPlayback,
  onPrefetchPlacement,
}: {
  readonly indexedRanges?: readonly {
    readonly endTimeNs: bigint;
    readonly startTimeNs: bigint;
  }[];
  readonly initialStatus?: FramePlacementReadinessStatus;
  readonly markLoadingOnPrefetch?: boolean;
  readonly onPlayback: (playback: ReturnType<typeof usePlayback>) => void;
  readonly onPrefetchPlacement: (
    timeNs: bigint,
    scope?: FramePlacementScope,
  ) => void;
}) {
  const dataStream = useDataStream();
  const isPlayPending = useIsPlayPending();
  const isPlaying = useIsPlaying();
  const playback = usePlayback();
  const bufferingDetail = useBufferingDetail();
  const [status, setStatus] =
    useState<FramePlacementReadinessStatus>(initialStatus);
  const frameTransforms = useMemo<FrameTransformsState>(
    () => ({
      error: null,
      frameIds: ["lidar"],
      getPlacementReadiness: ({ frameIds }) => ({ frameIds, status }),
      indexedDynamicRanges: () => indexedRanges,
      prefetchPlacement: (timeNs, scope) => {
        onPrefetchPlacement(timeNs, scope);
        if (markLoadingOnPrefetch) setStatus("loading");
      },
      resolve: (sourceFrameId, targetFrameId) => ({
        sourceFrameId,
        status: "missing",
        targetFrameId,
      }),
      status: "ready",
      summarizeGraph: () => EMPTY_EPISODE_FRAME_GRAPH_SUMMARY,
    }),
    [indexedRanges, markLoadingOnPrefetch, onPrefetchPlacement, status],
  );
  const readiness = useScene3dPlacementStream({
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
    <>
      <div data-testid="placement-status">
        {`${dataStream?.sourceKey ?? "none"}:${
          isPlayPending ? "pending" : "idle"
        }:${readiness.status}`}
      </div>
      <div data-testid="buffering-detail">{bufferingDetail ?? "none"}</div>
      <div data-testid="playback-playing">{isPlaying ? "yes" : "no"}</div>
    </>
  );
}
