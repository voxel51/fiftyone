import { useCreateTimeline } from "@fiftyone/playback";
import type { BufferRange } from "@fiftyone/utilities";
import React from "react";
import {
  McapImageBufferCache,
  type McapDecodedImageFrame,
} from "./image-buffer-cache";
import {
  findNearestTimestampAtOrAfter,
  findNearestTimestampAtOrBefore,
  getTimelineTimestampRangeForFrames,
  inferMcapTimelineFrameRate,
} from "./playback-utils";
import type {
  McapPlaybackPlan,
  McapSceneDescriptor,
  McapTimelineIndex,
} from "./types";
import { useMcapTimelineIndex } from "./useMcapTimelineIndex";

type McapImagePanelPlaybackState = {
  status: "idle" | "loading" | "ready" | "error" | "empty";
  frame: McapDecodedImageFrame | null;
  error: Error | null;
};

type UseMcapImagePlaybackResult = {
  timelineName: string | null;
  timeline: McapTimelineIndex | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
  isTimelineInitialized: boolean;
  hasPlayback: boolean;
  panelStates: Record<string, McapImagePanelPlaybackState>;
};

function createInitialPanelStates(
  streamIds: string[]
): Record<string, McapImagePanelPlaybackState> {
  return Object.fromEntries(
    streamIds.map((streamId) => [
      streamId,
      {
        status: "loading" as const,
        frame: null,
        error: null,
      },
    ])
  );
}

/** Manages shared timeline playback and decoded image frames for MCAP panels. */
export function useMcapImagePlayback(
  scene: McapSceneDescriptor | null,
  playbackPlan: McapPlaybackPlan | null
): UseMcapImagePlaybackResult {
  const imageStreamIds = React.useMemo(() => {
    return (playbackPlan?.panels ?? [])
      .filter((panel) => panel.contentType === "image")
      .map((panel) => panel.streamId);
  }, [playbackPlan]);
  const imageStreamIdsKey = React.useMemo(
    () => imageStreamIds.join("\n"),
    [imageStreamIds]
  );
  const timelineName = scene ? `mcap:${scene.sceneId}` : null;
  const timelineParams = React.useMemo(() => {
    if (!scene || !imageStreamIds.length) {
      return null;
    }

    return {
      datasetId: scene.datasetId,
      sampleId: scene.sampleId,
      request: {
        mediaField: scene.mediaField,
        streamIds: imageStreamIds,
      },
    };
  }, [imageStreamIds, scene]);
  const { timeline, isLoading, error, refetch } =
    useMcapTimelineIndex(timelineParams);
  const targetFrameRate = React.useMemo(
    () => inferMcapTimelineFrameRate(timeline?.timestampsNs ?? []),
    [timeline?.timestampsNs]
  );
  const { isTimelineInitialized, subscribe } = useCreateTimeline({
    name: timelineName ?? undefined,
    config:
      timelineName && timeline && timeline.timestampsNs.length
        ? {
            totalFrames: timeline.timestampsNs.length,
            defaultFrameNumber: 1,
            targetFrameRate,
          }
        : undefined,
  });
  const [panelStates, setPanelStates] = React.useState<
    Record<string, McapImagePanelPlaybackState>
  >({});
  const panelStatesRef = React.useRef(panelStates);
  const mountedRef = React.useRef(true);
  const sceneRef = React.useRef(scene);
  const timelineRef = React.useRef(timeline);
  const streamTimestampsRef = React.useRef(new Map<string, number[]>());
  const cachesRef = React.useRef(new Map<string, McapImageBufferCache>());
  const renderSequenceRef = React.useRef(new Map<string, number>());
  const subscriptionsRef = React.useRef(new Set<string>());

  React.useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      cachesRef.current.forEach((cache) => cache.dispose());
      cachesRef.current.clear();
    };
  }, []);

  React.useEffect(() => {
    panelStatesRef.current = panelStates;
  }, [panelStates]);

  React.useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  React.useEffect(() => {
    timelineRef.current = timeline;
    streamTimestampsRef.current = new Map(
      (timeline?.streams ?? []).map((stream) => [
        stream.streamId,
        stream.timestampsNs,
      ])
    );
  }, [timeline]);

  React.useEffect(() => {
    subscriptionsRef.current.clear();
    renderSequenceRef.current.clear();
    cachesRef.current.forEach((cache) => cache.dispose());
    cachesRef.current.clear();
    setPanelStates(createInitialPanelStates(imageStreamIds));
  }, [imageStreamIdsKey, scene?.sceneId]);

  const setPanelState = React.useCallback(
    (
      streamId: string,
      updater: (
        current: McapImagePanelPlaybackState
      ) => McapImagePanelPlaybackState
    ) => {
      if (!mountedRef.current) {
        return;
      }

      setPanelStates((currentStates) => {
        const currentState = currentStates[streamId] ?? {
          status: "idle" as const,
          frame: null,
          error: null,
        };

        return {
          ...currentStates,
          [streamId]: updater(currentState),
        };
      });
    },
    []
  );

  const getOrCreateCache = React.useCallback((streamId: string) => {
    const currentScene = sceneRef.current;
    if (!currentScene) {
      return null;
    }

    const existingCache = cachesRef.current.get(streamId);
    if (existingCache) {
      return existingCache;
    }

    const cache = new McapImageBufferCache({
      datasetId: currentScene.datasetId,
      sampleId: currentScene.sampleId,
      sceneId: currentScene.sceneId,
      streamId,
      mediaField: currentScene.mediaField,
      sceneRange: currentScene.timeRange,
    });
    cachesRef.current.set(streamId, cache);
    return cache;
  }, []);

  const loadStreamRange = React.useCallback(
    async (streamId: string, frameRange: BufferRange) => {
      const currentTimeline = timelineRef.current;
      const currentScene = sceneRef.current;

      if (!currentTimeline || !currentScene) {
        return;
      }

      const sharedRange = getTimelineTimestampRangeForFrames(
        currentTimeline.timestampsNs,
        frameRange
      );
      if (!sharedRange) {
        return;
      }

      const streamTimestamps = streamTimestampsRef.current.get(streamId) ?? [];
      if (!streamTimestamps.length) {
        setPanelState(streamId, (currentState) => ({
          ...currentState,
          status: "empty",
          error: null,
        }));
        return;
      }

      const startNs =
        findNearestTimestampAtOrBefore(streamTimestamps, sharedRange.startNs) ??
        findNearestTimestampAtOrAfter(streamTimestamps, sharedRange.startNs);
      const endNs =
        findNearestTimestampAtOrBefore(streamTimestamps, sharedRange.endNs) ??
        findNearestTimestampAtOrAfter(streamTimestamps, sharedRange.endNs);

      if (startNs === null || endNs === null || startNs > endNs) {
        return;
      }

      const cache = getOrCreateCache(streamId);
      if (!cache) {
        return;
      }

      setPanelState(streamId, (currentState) => ({
        ...currentState,
        status: currentState.frame ? currentState.status : "loading",
        error: null,
      }));

      await cache.ensureRange({ startNs, endNs });
    },
    [getOrCreateCache, setPanelState]
  );

  const renderStreamFrame = React.useCallback(
    async (streamId: string, frameNumber: number) => {
      const currentTimeline = timelineRef.current;

      if (!currentTimeline) {
        return;
      }

      const targetTimestamp = currentTimeline.timestampsNs[frameNumber - 1];
      if (targetTimestamp === undefined) {
        return;
      }

      const streamTimestamps = streamTimestampsRef.current.get(streamId) ?? [];
      const selectedTimestamp = findNearestTimestampAtOrBefore(
        streamTimestamps,
        targetTimestamp
      );

      if (selectedTimestamp === null) {
        setPanelState(streamId, (currentState) => ({
          ...currentState,
          status: "empty",
          error: null,
          frame: null,
        }));
        return;
      }

      const cache = getOrCreateCache(streamId);
      if (!cache) {
        return;
      }

      const message = cache.getMessageForLogTime(selectedTimestamp);
      if (!message) {
        setPanelState(streamId, (currentState) => ({
          ...currentState,
          status: "loading",
          error: null,
        }));
        return;
      }

      const currentState = panelStatesRef.current[streamId];
      if (
        currentState?.status === "ready" &&
        currentState.frame?.messageId === message.messageId
      ) {
        return;
      }

      const renderSequence = (renderSequenceRef.current.get(streamId) ?? 0) + 1;
      renderSequenceRef.current.set(streamId, renderSequence);

      setPanelState(streamId, (state) => ({
        ...state,
        status: "loading",
        error: null,
      }));

      try {
        const frame = await cache.decodeMessage(message);
        if (renderSequenceRef.current.get(streamId) !== renderSequence) {
          return;
        }

        setPanelState(streamId, () => ({
          status: "ready",
          frame,
          error: null,
        }));
      } catch (decodeError) {
        if (renderSequenceRef.current.get(streamId) !== renderSequence) {
          return;
        }

        setPanelState(streamId, (state) => ({
          ...state,
          status: "error",
          error:
            decodeError instanceof Error
              ? decodeError
              : new Error(String(decodeError)),
        }));
      }
    },
    [getOrCreateCache, setPanelState]
  );

  React.useEffect(() => {
    if (
      !timelineName ||
      !timeline ||
      !timeline.timestampsNs.length ||
      !isTimelineInitialized
    ) {
      return;
    }

    imageStreamIds.forEach((streamId) => {
      const subscriptionKey = `${timelineName}:${streamId}`;
      if (subscriptionsRef.current.has(subscriptionKey)) {
        return;
      }

      subscribe({
        id: `mcap:${scene?.sceneId}:${streamId}`,
        loadRange: async (frameRange) => {
          await loadStreamRange(streamId, frameRange);
        },
        renderFrame: async (frameNumber) => {
          await renderStreamFrame(streamId, frameNumber);
        },
      });

      subscriptionsRef.current.add(subscriptionKey);
    });
  }, [
    imageStreamIds,
    isTimelineInitialized,
    loadStreamRange,
    renderStreamFrame,
    scene?.sceneId,
    subscribe,
    timeline,
    timelineName,
  ]);

  return {
    timelineName,
    timeline,
    isLoading,
    error,
    refetch,
    isTimelineInitialized,
    hasPlayback: Boolean(timeline?.timestampsNs.length),
    panelStates,
  };
}
