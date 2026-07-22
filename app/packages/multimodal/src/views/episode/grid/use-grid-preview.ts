import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ByteSourceDescriptor,
  type EpisodePosterFrame,
  type EpisodePreviewReadResult,
} from "../../../ir";
import type { EpisodePreviewSession } from "../../../ports";
import {
  episodePreviewPlaybackDelayMs,
  publishEpisodeTimeRange,
  publishSourceBootstrap,
} from "../../../runtime";
import { errorMessage } from "../status/error-message";

/** Status values used by the format-neutral episode grid preview. */
export type GridPreviewStatus =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "unavailable"
  | "error";

/** Render state for one lightweight episode preview. */
export interface GridPreviewSnapshot {
  readonly error: string | null;
  readonly frame: EpisodePosterFrame | null;
  readonly hasPreviewStreams: boolean;
  readonly streamId: string | null;
  readonly streamSourceNames: readonly string[];
  readonly status: GridPreviewStatus;
}

/**
 * State returned by the episode grid preview hook.
 */
export interface GridPreviewState extends GridPreviewSnapshot {
  readonly isBuffering: boolean;
  pause(): void;
  play(): void;
}

/**
 * Options for rendering one lightweight episode stream preview in the grid.
 */
export interface UseGridPreviewOptions {
  readonly enabled?: boolean;
  /** Whether this tile is the user's current interactive target. */
  readonly hovered?: boolean;
  readonly previewSession: EpisodePreviewSession | null;
  readonly previewSessionError?: string | null;
  readonly previewSessionStatus?:
    | "error"
    | "idle"
    | "loading"
    | "ready"
    | "unavailable";
  readonly selectedSourceName?: string | null;
  readonly source: ByteSourceDescriptor | null;
}

/** Suppresses buffering chrome for ordinary fast grid frame reads. */
export const GRID_BUFFERING_DELAY_MS = 150;

const IDLE_PREVIEW_STATE: GridPreviewSnapshot = {
  error: null,
  frame: null,
  hasPreviewStreams: false,
  streamId: null,
  streamSourceNames: [],
  status: "idle",
} as const;

/**
 * Loads grid preview frames through a format-neutral preview session.
 * The first frame loads eagerly; `play`/`pause` (typically bound to hover)
 * advance playback from the last rendered frame.
 */
export function useGridPreview({
  enabled = true,
  hovered = false,
  previewSession,
  previewSessionError = null,
  previewSessionStatus = "idle",
  selectedSourceName,
  source,
}: UseGridPreviewOptions): GridPreviewState {
  const [state, setState] = useState<GridPreviewSnapshot>(IDLE_PREVIEW_STATE);
  const [playing, setPlaying] = useState(false);
  const initialLoadInFlightRef = useRef(false);
  const loadedRequestRef = useRef<{
    readonly selectedSourceName?: string | null;
    readonly source: ByteSourceDescriptor;
  } | null>(null);
  const frameTimeNsRef = useRef<bigint | undefined>(undefined);
  const nextStartTimeNsRef = useRef<bigint | undefined>(undefined);
  const {
    finish: finishBuffering,
    start: startBuffering,
    visible: isBuffering,
  } = useGridPreviewBufferingIndicator();
  const pause = useCallback(() => setPlaying(false), []);
  const play = useCallback(() => {
    if (enabled) {
      setPlaying(true);
    }
  }, [enabled]);

  // This effect resets only when the requested source or stream changes.
  // Visibility changes preserve the last frame so cache re-entry is free.
  useEffect(() => {
    initialLoadInFlightRef.current = false;
    loadedRequestRef.current = null;
    frameTimeNsRef.current = undefined;
    nextStartTimeNsRef.current = undefined;
    finishBuffering();
    setPlaying(false);
    setState(
      source
        ? {
            error: null,
            frame: null,
            hasPreviewStreams: false,
            streamId: null,
            streamSourceNames: [],
            status: "loading",
          }
        : IDLE_PREVIEW_STATE,
    );
  }, [finishBuffering, selectedSourceName, source]);

  // This effect surfaces adapter failures and unsupported preview providers
  // without exposing format details to the grid.
  useEffect(() => {
    if (!source || previewSessionStatus === "idle") return;
    if (previewSessionStatus === "loading") {
      setState((current) =>
        current.frame ? current : { ...current, status: "loading" },
      );
      return;
    }
    if (previewSessionStatus === "unavailable") {
      setState({
        error: null,
        frame: null,
        hasPreviewStreams: false,
        streamId: null,
        streamSourceNames: [],
        status: "unavailable",
      });
      return;
    }
    if (previewSessionStatus === "error") {
      setState({
        error: previewSessionError ?? "Episode preview failed to open",
        frame: null,
        hasPreviewStreams: false,
        streamId: null,
        streamSourceNames: [],
        status: "error",
      });
    }
  }, [previewSessionError, previewSessionStatus, source]);

  // This effect stops hover playback whenever the grid renderer is inactive.
  useEffect(() => {
    if (!enabled) {
      finishBuffering();
      setPlaying(false);
    }
  }, [enabled, finishBuffering]);

  // This effect loads the initial frame as visible-only background work until
  // hover promotes the pending request to current-frame priority.
  useEffect(() => {
    if (!enabled || !source || !previewSession) {
      return undefined;
    }
    const loadedRequest = loadedRequestRef.current;
    if (
      loadedRequest?.source === source &&
      loadedRequest.selectedSourceName === selectedSourceName
    ) {
      return undefined;
    }

    let active = true;
    const controller = new AbortController();
    initialLoadInFlightRef.current = true;
    frameTimeNsRef.current = undefined;
    nextStartTimeNsRef.current = undefined;

    const request = selectedSourceName
      ? { sourceName: selectedSourceName }
      : {};
    previewSession
      .read(request, {
        priority: hovered ? "current" : "idle",
        signal: controller.signal,
      })
      .then((result) => {
        if (active) {
          publishGridBootstrap(source, result);
          loadedRequestRef.current = { selectedSourceName, source };
          frameTimeNsRef.current = result.frameTimeNs;
          nextStartTimeNsRef.current = result.nextStartTimeNs;
          setState(snapshotFromResult(result));
        }
      })
      .catch((caughtError) => {
        if (!active || controller.signal.aborted) {
          return;
        }

        setState({
          error: errorMessage(caughtError),
          frame: null,
          hasPreviewStreams: false,
          streamId: null,
          streamSourceNames: [],
          status: "error",
        });
      })
      .finally(() => {
        if (active) {
          initialLoadInFlightRef.current = false;
        }
      });

    return () => {
      active = false;
      initialLoadInFlightRef.current = false;
      controller.abort();
    };
  }, [enabled, hovered, previewSession, selectedSourceName, source]);

  // This effect runs the hover playback loop: while playing, it keeps
  // requesting the next frame, wrapping back to the start when the
  // source runs out of frames.
  useEffect(() => {
    if (
      !playing ||
      !enabled ||
      !source ||
      !previewSession ||
      state.status !== "ready" ||
      initialLoadInFlightRef.current
    ) {
      return undefined;
    }

    let active = true;
    const controller = new AbortController();
    let bootstrapPublished = false;
    let previousFrameTimeNs = frameTimeNsRef.current;
    let presentedAtMs = performance.now();

    const run = async () => {
      try {
        while (active) {
          if (initialLoadInFlightRef.current) {
            break;
          }

          const request = selectedSourceName
            ? {
                sourceName: selectedSourceName,
                startTimeNs: nextStartTimeNsRef.current,
              }
            : {
                startTimeNs: nextStartTimeNsRef.current,
              };
          startBuffering();
          const result = await previewSession.read(request, {
            priority: "current",
            signal: controller.signal,
          });
          finishBuffering();

          if (!active) {
            break;
          }

          if (!result.frame) {
            frameTimeNsRef.current = undefined;
            nextStartTimeNsRef.current = undefined;
            previousFrameTimeNs = undefined;
            await delayMs(
              episodePreviewPlaybackDelayMs(undefined, undefined) ?? 0,
              controller.signal,
            );
            if (!active) {
              break;
            }
            continue;
          }

          const playbackDelayMs = episodePreviewPlaybackDelayMs(
            previousFrameTimeNs,
            result.frameTimeNs,
            performance.now() - presentedAtMs,
          );
          if (playbackDelayMs === null) {
            nextStartTimeNsRef.current = result.nextStartTimeNs;
            continue;
          }

          await delayMs(playbackDelayMs, controller.signal);
          if (!active) {
            break;
          }

          if (!bootstrapPublished) {
            publishGridBootstrap(source, result);
            bootstrapPublished = true;
          }

          frameTimeNsRef.current = result.frameTimeNs;
          nextStartTimeNsRef.current = result.nextStartTimeNs;
          setState(snapshotFromResult(result));
          previousFrameTimeNs = result.frameTimeNs;
          presentedAtMs = performance.now();
        }
      } catch (caughtError) {
        finishBuffering();
        if (active && !controller.signal.aborted) {
          setState((currentState) => ({
            ...currentState,
            error: errorMessage(caughtError),
            status: currentState.frame ? "ready" : "error",
          }));
        }
      }
    };

    void run();

    return () => {
      active = false;
      finishBuffering();
      controller.abort();
    };
  }, [
    enabled,
    finishBuffering,
    playing,
    previewSession,
    selectedSourceName,
    source,
    startBuffering,
    state.status,
  ]);

  return { ...state, isBuffering, pause, play };
}

function useGridPreviewBufferingIndicator() {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finish = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
  }, []);
  const start = useCallback(() => {
    if (timerRef.current !== null) {
      return;
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setVisible(true);
    }, GRID_BUFFERING_DELAY_MS);
  }, []);

  // This effect clears the timer without scheduling state during unmount.
  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  return { finish, start, visible };
}

function publishGridBootstrap(
  source: ByteSourceDescriptor,
  result: EpisodePreviewReadResult,
): void {
  if (
    !result.bootstrapManifest &&
    !result.bootstrapTimeline &&
    !result.bootstrapTimeRange &&
    !result.frame
  ) {
    return;
  }

  publishSourceBootstrap(source, {
    ...(result.bootstrapManifest ? { manifest: result.bootstrapManifest } : {}),
    ...(result.bootstrapTimeline ? { timeline: result.bootstrapTimeline } : {}),
    ...(result.bootstrapTimeRange
      ? { timeRange: result.bootstrapTimeRange }
      : {}),
    ...(result.frame
      ? {
          poster: result.frame,
          ...(result.streamId ? { posterStreamId: result.streamId } : {}),
        }
      : {}),
  });
  const timeRange = result.bootstrapTimeline
    ? {
        endNs: result.bootstrapTimeline.endNs,
        startNs: result.bootstrapTimeline.startNs,
      }
    : result.bootstrapTimeRange;
  if (timeRange) {
    publishEpisodeTimeRange(source.sourceId, timeRange);
  }
}

function snapshotFromResult(
  result: EpisodePreviewReadResult,
): GridPreviewSnapshot {
  return {
    error: null,
    frame: result.frame,
    hasPreviewStreams: result.streamSourceNames.length > 0,
    streamId: result.streamId,
    streamSourceNames: result.streamSourceNames,
    status: result.status,
  };
}

function delayMs(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (milliseconds <= 0 || signal.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });

    function finish() {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    }
  });
}
