import type { BufferRange, Buffers } from "@fiftyone/utilities";
import { TimelineManager } from "@fiftyone/playback/experimental/core/TimelineManager";
import type {
  BufferGoalInfo,
  BufferReadiness,
  PlayState,
  TimelineRenderContext,
} from "@fiftyone/playback/experimental/types";
import React from "react";
import { MULTIMODAL_BUFFER_WINDOW_SIZE_NS } from "./playback-utils";

type MultimodalExperimentalTimelineOptions = {
  name: string | null;
  durationNs: number;
  tickRate: number;
  coverage: number[];
  onPrefetchRange: (range: [number, number]) => Promise<void>;
  onPrepareTime?: (
    timeNs: number,
    context: TimelineRenderContext
  ) => Promise<void> | void;
  onRenderTime: (timeNs: number, context: TimelineRenderContext) => void;
  onPreviewTime?: (
    timeNs: number,
    context: TimelineRenderContext
  ) => Promise<void> | void;
  getBufferReadiness?: (timeNs: number) => BufferReadiness;
  getBufferedRanges?: () => Buffers;
  isBufferingCritical?: boolean;
  canControlPlayback?: boolean;
};

export type MultimodalExperimentalTimelineState = {
  name: string | null;
  isInitialized: boolean;
  hasPlayback: boolean;
  canControlPlayback: boolean;
  playState: PlayState;
  currentTimeNs: number;
  durationNs: number;
  speed: number;
  loaded: Buffers;
  loading: BufferRange;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setSpeed: (speed: number) => void;
  seekToPercentage: (percentage: number) => Promise<void>;
  seekToTime: (timeNs: number) => Promise<void>;
  notifySeekStart: () => void;
  notifySeekEnd: () => void;
  stepForward: () => Promise<void>;
  stepBackward: () => Promise<void>;
};

const EMPTY_BUFFERS: Buffers = [];
const EMPTY_BUFFER_RANGE: BufferRange = [0, 0];

export function useMultimodalExperimentalTimeline(
  options: MultimodalExperimentalTimelineOptions | null
): MultimodalExperimentalTimelineState {
  const managerRef = React.useRef<TimelineManager | null>(null);
  const [isInitialized, setIsInitialized] = React.useState(false);
  const [playState, setPlayState] = React.useState<PlayState>("paused");
  const [currentTimeNs, setCurrentTimeNs] = React.useState(0);
  const [speed, setSpeedState] = React.useState(1);
  const [loaded, setLoaded] = React.useState<Buffers>(EMPTY_BUFFERS);
  const [loading, setLoading] = React.useState<BufferRange>(EMPTY_BUFFER_RANGE);
  const isScrubbingRef = React.useRef(false);
  const scrubPreviewTimeRef = React.useRef<number | null>(null);
  const canControlPlayback =
    options?.canControlPlayback ?? Boolean(options?.coverage.length);
  const getBufferGoal = React.useCallback(
    (timeNs: number, info: BufferGoalInfo) => {
      const speed = info.config.speed ?? 1;
      const maintainAheadNs = MULTIMODAL_BUFFER_WINDOW_SIZE_NS * speed;
      const refillAheadNs = MULTIMODAL_BUFFER_WINDOW_SIZE_NS * speed * 2;
      const maintainStart = Math.max(
        info.range[0],
        timeNs - MULTIMODAL_BUFFER_WINDOW_SIZE_NS
      );
      const maintainEnd = Math.min(info.range[1], timeNs + maintainAheadNs);
      const refillEnd = Math.min(info.range[1], timeNs + refillAheadNs);

      return {
        maintain: [maintainStart, maintainEnd] as const,
        refillTo: [maintainStart, refillEnd] as const,
      };
    },
    []
  );

  React.useEffect(() => {
    if (!options?.name) {
      managerRef.current?.destroy();
      managerRef.current = null;
      setIsInitialized(false);
      setPlayState("paused");
      setCurrentTimeNs(0);
      setSpeedState(1);
      setLoaded(EMPTY_BUFFERS);
      setLoading(EMPTY_BUFFER_RANGE);
      isScrubbingRef.current = false;
      scrubPreviewTimeRef.current = null;
      return;
    }

    const existingManager = managerRef.current;
    if (existingManager && existingManager.name !== options.name) {
      existingManager.pause();
      existingManager.destroy();
    }
    const manager =
      existingManager?.name === options.name
        ? existingManager
        : new TimelineManager({ name: options.name });
    manager.initialize({
      name: options.name,
      config: {
        type: "duration",
        duration: options.durationNs,
        defaultTime:
          existingManager?.name === options.name
            ? existingManager.snapshot.timeInt
            : 0,
        speed:
          existingManager?.name === options.name ? existingManager.speed : 1,
        tickRate: options.tickRate,
        useTimeIndicator: true,
      },
    });

    managerRef.current = manager;
    setIsInitialized(manager.isInitialized);
    setPlayState(manager.playState);
    setCurrentTimeNs(manager.snapshot.timeInt);
    setSpeedState(manager.speed);
    setLoaded(manager.loadedBuffers);
    setLoading(manager.currentBufferingRange);

    const unsubscribeTimeChange = manager.on(
      "timeline:timeChange",
      ({ snapshot }) => {
        if (!isScrubbingRef.current) {
          setCurrentTimeNs(snapshot.timeInt);
        }
      }
    );
    const unsubscribePlayStateChange = manager.on(
      "timeline:playStateChange",
      ({ state }) => {
        setPlayState(state);
      }
    );
    const unsubscribeBufferChange = manager.on(
      "timeline:bufferChange",
      ({ loaded: nextLoaded, loading: nextLoading }) => {
        setLoaded(nextLoaded);
        setLoading(nextLoading);
      }
    );
    const unsubscribeConfigChange = manager.on(
      "timeline:configChange",
      ({ config }) => {
        setSpeedState(config.speed ?? 1);
      }
    );

    setLoaded(manager.loadedBuffers);
    setLoading(manager.currentBufferingRange);

    return () => {
      unsubscribeTimeChange();
      unsubscribePlayStateChange();
      unsubscribeBufferChange();
      unsubscribeConfigChange();
      if (managerRef.current !== manager) {
        manager.pause();
        manager.destroy();
      }
    };
  }, [options?.durationNs, options?.name, options?.tickRate]);

  React.useEffect(() => {
    if (!options?.name) {
      return;
    }

    const manager = managerRef.current;
    if (!manager) {
      return;
    }

    const unsubscribeSubscriber = manager.subscribe({
      id: `${options.name}:multimodal-workspace`,
      prepareAt: options.onPrepareTime
        ? (snapshot, context) => {
            return options.onPrepareTime?.(snapshot.timeInt, context);
          }
        : undefined,
      renderAt: (snapshot, context) => {
        options.onRenderTime(
          snapshot.timeInt,
          context as TimelineRenderContext
        );
      },
      previewAt: options.onPreviewTime
        ? (snapshot, context) => {
            return options.onPreviewTime?.(
              snapshot.timeInt,
              context as TimelineRenderContext
            );
          }
        : undefined,
      prefetch: async (range) => {
        await options.onPrefetchRange(range as [number, number]);
        manager.refreshBufferedRanges();
      },
      bufferState: options.getBufferReadiness,
      getBufferGoal,
      reportCoverage: () => options.coverage,
      reportBufferedRanges: options.getBufferedRanges,
      capabilities: {
        critical: options.isBufferingCritical ?? false,
      },
    });

    setLoaded(manager.loadedBuffers);
    setLoading(manager.currentBufferingRange);

    return () => {
      unsubscribeSubscriber();
    };
  }, [
    options?.coverage,
    options?.getBufferReadiness,
    options?.getBufferedRanges,
    getBufferGoal,
    options?.isBufferingCritical,
    options?.name,
    options?.onPrefetchRange,
    options?.onPrepareTime,
    options?.onPreviewTime,
    options?.onRenderTime,
  ]);

  const play = React.useCallback(() => {
    if (!canControlPlayback) {
      return;
    }
    managerRef.current?.play();
  }, [canControlPlayback]);

  const pause = React.useCallback(() => {
    managerRef.current?.pause();
  }, []);

  const togglePlay = React.useCallback(() => {
    if (!canControlPlayback) {
      return;
    }
    managerRef.current?.togglePlay();
  }, [canControlPlayback]);

  const setSpeed = React.useCallback((nextSpeed: number) => {
    managerRef.current?.updateConfig({ speed: nextSpeed });
  }, []);

  const seekToTime = React.useCallback(async (timeNs: number) => {
    const manager = managerRef.current;
    if (!manager) {
      return;
    }

    if (isScrubbingRef.current) {
      scrubPreviewTimeRef.current = timeNs;
      setCurrentTimeNs(timeNs);
      await manager.previewTime(timeNs);
      return;
    }

    await manager.setTime(timeNs);
  }, []);

  const seekToPercentage = React.useCallback(
    async (percentage: number) => {
      const clampedPercentage = Math.max(0, Math.min(percentage, 100));
      const durationNs = options?.durationNs ?? 0;
      await seekToTime(Math.round((clampedPercentage / 100) * durationNs));
    },
    [options?.durationNs, seekToTime]
  );

  const notifySeekStart = React.useCallback(() => {
    isScrubbingRef.current = true;
    scrubPreviewTimeRef.current = managerRef.current?.snapshot.timeInt ?? null;
    managerRef.current?.notifySeekStart();
  }, []);

  const notifySeekEnd = React.useCallback(() => {
    const manager = managerRef.current;
    const targetTimeNs =
      scrubPreviewTimeRef.current ?? managerRef.current?.snapshot.timeInt ?? 0;
    isScrubbingRef.current = false;
    scrubPreviewTimeRef.current = null;
    manager?.notifySeekEnd();
    void manager?.setTime(targetTimeNs);
  }, []);

  const stepForward = React.useCallback(async () => {
    if (!canControlPlayback) {
      return;
    }
    await managerRef.current?.stepForward();
  }, [canControlPlayback]);

  const stepBackward = React.useCallback(async () => {
    if (!canControlPlayback) {
      return;
    }
    await managerRef.current?.stepBackward();
  }, [canControlPlayback]);

  return React.useMemo(
    () => ({
      name: options?.name ?? null,
      isInitialized,
      hasPlayback: Boolean(options?.name),
      canControlPlayback,
      playState,
      currentTimeNs,
      durationNs: options?.durationNs ?? 0,
      speed,
      loaded,
      loading,
      play,
      pause,
      togglePlay,
      setSpeed,
      seekToPercentage,
      seekToTime,
      notifySeekStart,
      notifySeekEnd,
      stepForward,
      stepBackward,
    }),
    [
      currentTimeNs,
      canControlPlayback,
      isInitialized,
      loaded,
      loading,
      notifySeekEnd,
      notifySeekStart,
      options?.durationNs,
      options?.name,
      pause,
      play,
      playState,
      seekToPercentage,
      seekToTime,
      setSpeed,
      speed,
      stepBackward,
      stepForward,
      togglePlay,
    ]
  );
}
