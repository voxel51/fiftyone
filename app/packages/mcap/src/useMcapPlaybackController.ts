import { useCreateTimeline } from "@fiftyone/playback";
import type { BufferRange } from "@fiftyone/utilities";
import React from "react";
import type { Image2dFrame, Points3dFrame } from "./archetypes";
import {
  McapImageBufferCache,
  type McapDecodedImageFrame,
} from "./image-buffer-cache";
import {
  McapPointCloudBufferCache,
  type McapDecodedPointCloudFrame,
} from "./pointcloud-buffer-cache";
import {
  findNearestTimestampAtOrAfter,
  findNearestTimestampAtOrBefore,
  getTimelineTimestampRangeForFrames,
  inferMcapTimelineFrameRate,
} from "./playback-utils";
import type {
  McapPanelPlan,
  McapPlaybackPlan,
  McapSceneDescriptor,
  McapTimelineIndex,
} from "./types";
import { useMcapTimelineIndex } from "./useMcapTimelineIndex";

type McapPlaybackArchetype = "image2d" | "points3d";

/** Render-ready playback state for one MCAP panel at the shared cursor. */
export type McapPlaybackPanelState = {
  status: "idle" | "loading" | "ready" | "error" | "empty";
  archetype: McapPlaybackArchetype;
  frame: Image2dFrame | Points3dFrame | null;
  messageId: string | null;
  logTimeNs: number | null;
  publishTimeNs: number | null;
  error: Error | null;
};

type UseMcapPlaybackControllerResult = {
  timelineName: string | null;
  timeline: McapTimelineIndex | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
  isTimelineInitialized: boolean;
  hasPlayback: boolean;
  panelStates: Record<string, McapPlaybackPanelState>;
};

function getPanelArchetype(panel: McapPanelPlan): McapPlaybackArchetype {
  return panel.contentType === "image" ? "image2d" : "points3d";
}

function createInitialPanelStates(panels: McapPanelPlan[]) {
  return Object.fromEntries(
    panels.map((panel) => [
      panel.panelId,
      {
        status: "loading" as const,
        archetype: getPanelArchetype(panel),
        frame: null,
        messageId: null,
        logTimeNs: null,
        publishTimeNs: null,
        error: null,
      },
    ])
  ) as Record<string, McapPlaybackPanelState>;
}

/** Manages shared timeline playback and render-ready panel frames for MCAP scenes. */
export function useMcapPlaybackController(
  scene: McapSceneDescriptor | null,
  playbackPlan: McapPlaybackPlan | null
): UseMcapPlaybackControllerResult {
  const panels = React.useMemo(
    () => playbackPlan?.panels ?? [],
    [playbackPlan]
  );
  const panelsKey = React.useMemo(() => {
    return panels
      .map((panel) => `${panel.panelId}:${panel.streamId}`)
      .join("\n");
  }, [panels]);
  const timelineName = scene ? `mcap:${scene.sceneId}` : null;
  const timelineParams = React.useMemo(() => {
    if (!scene || !panels.length) {
      return null;
    }

    return {
      datasetId: scene.datasetId,
      sampleId: scene.sampleId,
      request: {
        mediaField: scene.mediaField,
        streamIds: panels.map((panel) => panel.streamId),
      },
    };
  }, [panels, scene]);
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
    Record<string, McapPlaybackPanelState>
  >({});
  const panelStatesRef = React.useRef(panelStates);
  const mountedRef = React.useRef(true);
  const sceneRef = React.useRef(scene);
  const timelineRef = React.useRef(timeline);
  const streamTimestampsRef = React.useRef(new Map<string, number[]>());
  const imageCachesRef = React.useRef(new Map<string, McapImageBufferCache>());
  const pointCloudCachesRef = React.useRef(
    new Map<string, McapPointCloudBufferCache>()
  );
  const renderSequenceRef = React.useRef(new Map<string, number>());
  const subscriptionsRef = React.useRef(new Set<string>());

  React.useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      imageCachesRef.current.forEach((cache) => cache.dispose());
      pointCloudCachesRef.current.forEach((cache) => cache.dispose());
      imageCachesRef.current.clear();
      pointCloudCachesRef.current.clear();
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
    imageCachesRef.current.forEach((cache) => cache.dispose());
    pointCloudCachesRef.current.forEach((cache) => cache.dispose());
    imageCachesRef.current.clear();
    pointCloudCachesRef.current.clear();
    setPanelStates(createInitialPanelStates(panels));
  }, [panelsKey, scene?.sceneId]);

  const setPanelState = React.useCallback(
    (
      panelId: string,
      updater: (current: McapPlaybackPanelState) => McapPlaybackPanelState
    ) => {
      if (!mountedRef.current) {
        return;
      }

      setPanelStates((currentStates) => {
        const panel = panels.find((candidate) => candidate.panelId === panelId);
        const fallbackState: McapPlaybackPanelState = {
          status: "idle",
          archetype: panel ? getPanelArchetype(panel) : "image2d",
          frame: null,
          messageId: null,
          logTimeNs: null,
          publishTimeNs: null,
          error: null,
        };

        return {
          ...currentStates,
          [panelId]: updater(currentStates[panelId] ?? fallbackState),
        };
      });
    },
    [panels]
  );

  const getOrCreateImageCache = React.useCallback((streamId: string) => {
    const currentScene = sceneRef.current;
    if (!currentScene) {
      return null;
    }

    const existingCache = imageCachesRef.current.get(streamId);
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
    imageCachesRef.current.set(streamId, cache);
    return cache;
  }, []);

  const getOrCreatePointCloudCache = React.useCallback((streamId: string) => {
    const currentScene = sceneRef.current;
    if (!currentScene) {
      return null;
    }

    const existingCache = pointCloudCachesRef.current.get(streamId);
    if (existingCache) {
      return existingCache;
    }

    const cache = new McapPointCloudBufferCache({
      datasetId: currentScene.datasetId,
      sampleId: currentScene.sampleId,
      sceneId: currentScene.sceneId,
      streamId,
      mediaField: currentScene.mediaField,
      sceneRange: currentScene.timeRange,
    });
    pointCloudCachesRef.current.set(streamId, cache);
    return cache;
  }, []);

  const loadPanelRange = React.useCallback(
    async (panel: McapPanelPlan, frameRange: BufferRange) => {
      const currentTimeline = timelineRef.current;

      if (!currentTimeline) {
        return;
      }

      const sharedRange = getTimelineTimestampRangeForFrames(
        currentTimeline.timestampsNs,
        frameRange
      );
      if (!sharedRange) {
        return;
      }

      const streamTimestamps =
        streamTimestampsRef.current.get(panel.streamId) ?? [];
      if (!streamTimestamps.length) {
        setPanelState(panel.panelId, (currentState) => ({
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

      if (panel.contentType === "image") {
        const cache = getOrCreateImageCache(panel.streamId);
        if (!cache) {
          return;
        }

        setPanelState(panel.panelId, (currentState) => ({
          ...currentState,
          status: currentState.frame ? currentState.status : "loading",
          error: null,
        }));
        await cache.ensureRange({ startNs, endNs });
        return;
      }

      const cache = getOrCreatePointCloudCache(panel.streamId);
      if (!cache) {
        return;
      }

      setPanelState(panel.panelId, (currentState) => ({
        ...currentState,
        status: currentState.frame ? currentState.status : "loading",
        error: null,
      }));
      await cache.ensureRange({ startNs, endNs });
    },
    [getOrCreateImageCache, getOrCreatePointCloudCache, setPanelState]
  );

  const renderDecodedFrame = React.useCallback(
    async (panel: McapPanelPlan, frameNumber: number) => {
      const currentTimeline = timelineRef.current;
      if (!currentTimeline) {
        return;
      }

      const targetTimestamp = currentTimeline.timestampsNs[frameNumber - 1];
      if (targetTimestamp === undefined) {
        return;
      }

      const streamTimestamps =
        streamTimestampsRef.current.get(panel.streamId) ?? [];
      const selectedTimestamp = findNearestTimestampAtOrBefore(
        streamTimestamps,
        targetTimestamp
      );

      if (selectedTimestamp === null) {
        setPanelState(panel.panelId, (currentState) => ({
          ...currentState,
          status: "empty",
          frame: null,
          messageId: null,
          logTimeNs: null,
          publishTimeNs: null,
          error: null,
        }));
        return;
      }

      const currentState = panelStatesRef.current[panel.panelId];
      const renderSequence =
        (renderSequenceRef.current.get(panel.panelId) ?? 0) + 1;
      renderSequenceRef.current.set(panel.panelId, renderSequence);

      if (panel.contentType === "image") {
        const cache = getOrCreateImageCache(panel.streamId);
        const message = cache?.getMessageForLogTime(selectedTimestamp);
        if (!cache || !message) {
          setPanelState(panel.panelId, (state) => ({
            ...state,
            status: "loading",
            error: null,
          }));
          return;
        }

        if (
          currentState?.status === "ready" &&
          currentState.messageId === message.messageId
        ) {
          return;
        }

        setPanelState(panel.panelId, (state) => ({
          ...state,
          status: "loading",
          error: null,
        }));

        try {
          const frame = await cache.decodeMessage(message);
          if (renderSequenceRef.current.get(panel.panelId) !== renderSequence) {
            return;
          }

          setPanelState(panel.panelId, () => ({
            status: "ready",
            archetype: "image2d",
            frame,
            messageId: frame.messageId,
            logTimeNs: frame.logTimeNs,
            publishTimeNs: frame.publishTimeNs,
            error: null,
          }));
        } catch (decodeError) {
          if (renderSequenceRef.current.get(panel.panelId) !== renderSequence) {
            return;
          }

          setPanelState(panel.panelId, (state) => ({
            ...state,
            status: "error",
            error:
              decodeError instanceof Error
                ? decodeError
                : new Error(String(decodeError)),
          }));
        }

        return;
      }

      const cache = getOrCreatePointCloudCache(panel.streamId);
      const message = cache?.getMessageForLogTime(selectedTimestamp);
      if (!cache || !message) {
        setPanelState(panel.panelId, (state) => ({
          ...state,
          status: "loading",
          error: null,
        }));
        return;
      }

      if (
        currentState?.status === "ready" &&
        currentState.messageId === message.messageId
      ) {
        return;
      }

      setPanelState(panel.panelId, (state) => ({
        ...state,
        status: "loading",
        error: null,
      }));

      try {
        const frame = await cache.decodeMessage(message);
        if (renderSequenceRef.current.get(panel.panelId) !== renderSequence) {
          return;
        }

        if (frame.pointCount <= 0) {
          setPanelState(panel.panelId, (state) => ({
            ...state,
            status: "empty",
            frame: null,
            messageId: frame.messageId,
            logTimeNs: frame.logTimeNs,
            publishTimeNs: frame.publishTimeNs,
            error: null,
          }));
          return;
        }

        setPanelState(panel.panelId, () => ({
          status: "ready",
          archetype: "points3d",
          frame,
          messageId: frame.messageId,
          logTimeNs: frame.logTimeNs,
          publishTimeNs: frame.publishTimeNs,
          error: null,
        }));
      } catch (decodeError) {
        if (renderSequenceRef.current.get(panel.panelId) !== renderSequence) {
          return;
        }

        setPanelState(panel.panelId, (state) => ({
          ...state,
          status: "error",
          error:
            decodeError instanceof Error
              ? decodeError
              : new Error(String(decodeError)),
        }));
      }
    },
    [getOrCreateImageCache, getOrCreatePointCloudCache, setPanelState]
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

    panels.forEach((panel) => {
      const subscriptionKey = `${timelineName}:${panel.panelId}`;
      if (subscriptionsRef.current.has(subscriptionKey)) {
        return;
      }

      subscribe({
        id: `mcap:${scene?.sceneId}:${panel.panelId}`,
        loadRange: async (frameRange) => {
          await loadPanelRange(panel, frameRange);
        },
        renderFrame: async (frameNumber) => {
          await renderDecodedFrame(panel, frameNumber);
        },
      });

      subscriptionsRef.current.add(subscriptionKey);
    });
  }, [
    isTimelineInitialized,
    loadPanelRange,
    panels,
    renderDecodedFrame,
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

export type { McapDecodedImageFrame, McapDecodedPointCloudFrame };
