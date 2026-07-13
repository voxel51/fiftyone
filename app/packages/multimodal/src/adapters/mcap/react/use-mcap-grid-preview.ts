import { useCallback, useEffect, useRef, useState } from "react";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import { mcapErrorMessage } from "../errors";
import {
  mcapGridPreviewPlaybackDelayMs,
  type McapGridPreviewResult,
  type McapGridPreviewSnapshot,
  type McapGridPreviewStatus,
} from "../grid-preview";
import { publishMcapSourceBootstrap } from "../source-bootstrap-cache";
import { getMcapGridPreviewPool } from "../worker";
import { MCAP_PLAYBACK_WORKER_PRIORITY } from "../worker/playback-worker-types";

/**
 * State returned by the MCAP grid preview hook.
 */
export interface McapGridPreviewState extends McapGridPreviewSnapshot {
  pause(): void;
  play(): void;
}

/**
 * Options for rendering one lightweight MCAP stream preview in the grid.
 */
export interface UseMcapGridPreviewOptions {
  readonly enabled?: boolean;
  readonly selectedStreamTopic?: string | null;
  readonly source: ByteSourceDescriptor | null;
}

const IDLE_PREVIEW_STATE: McapGridPreviewSnapshot = {
  error: null,
  frame: null,
  hasPreviewTopics: false,
  streamTopic: null,
  streamTopics: [],
  status: "idle",
} as const;

/**
 * Loads MCAP grid preview frames through the shared bounded worker pool.
 * The first frame loads eagerly; `play`/`pause` (typically bound to hover)
 * advance playback from the last rendered frame.
 */
export function useMcapGridPreview({
  enabled = true,
  selectedStreamTopic,
  source,
}: UseMcapGridPreviewOptions): McapGridPreviewState {
  const [state, setState] =
    useState<McapGridPreviewSnapshot>(IDLE_PREVIEW_STATE);
  const [playing, setPlaying] = useState(false);
  const initialLoadInFlightRef = useRef(false);
  const loadedRequestRef = useRef<{
    readonly selectedStreamTopic?: string | null;
    readonly source: ByteSourceDescriptor;
  } | null>(null);
  const frameTimeNsRef = useRef<bigint | undefined>(undefined);
  const nextStartTimeNsRef = useRef<bigint | undefined>(undefined);
  const pause = useCallback(() => setPlaying(false), []);
  const play = useCallback(() => {
    if (enabled) {
      setPlaying(true);
    }
  }, [enabled]);

  // Reset only when the requested source/stream changes. Visibility changes
  // intentionally preserve the last frame so hidden-cache re-entry is free.
  useEffect(() => {
    initialLoadInFlightRef.current = false;
    loadedRequestRef.current = null;
    frameTimeNsRef.current = undefined;
    nextStartTimeNsRef.current = undefined;
    setPlaying(false);
    setState(
      source
        ? {
            error: null,
            frame: null,
            hasPreviewTopics: false,
            streamTopic: null,
            streamTopics: [],
            status: "loading",
          }
        : IDLE_PREVIEW_STATE,
    );
  }, [selectedStreamTopic, source]);

  // This effect stops hover playback whenever the grid renderer is inactive.
  useEffect(() => {
    if (!enabled) {
      setPlaying(false);
    }
  }, [enabled]);

  // Initial frames are visible-only background work. Hover playback is queued
  // at CURRENT_FRAME priority and can overtake a scroll-settle decode burst.
  useEffect(() => {
    if (!enabled || !source) {
      return undefined;
    }
    const loadedRequest = loadedRequestRef.current;
    if (
      loadedRequest?.source === source &&
      loadedRequest.selectedStreamTopic === selectedStreamTopic
    ) {
      return undefined;
    }

    let active = true;
    const controller = new AbortController();
    const pool = getMcapGridPreviewPool();
    pool.acquire();
    initialLoadInFlightRef.current = true;
    frameTimeNsRef.current = undefined;
    nextStartTimeNsRef.current = undefined;

    const request = selectedStreamTopic
      ? { selectedStreamTopic, source }
      : { source };
    pool
      .request(request, {
        priority: MCAP_PLAYBACK_WORKER_PRIORITY.IDLE_PREFETCH,
        signal: controller.signal,
      })
      .then((result) => {
        if (active) {
          publishGridBootstrap(source, result);
          loadedRequestRef.current = { selectedStreamTopic, source };
          frameTimeNsRef.current = result.frameTimeNs;
          nextStartTimeNsRef.current = result.nextStartTimeNs;
          setState(result.state);
        }
      })
      .catch((caughtError) => {
        if (!active || controller.signal.aborted) {
          return;
        }

        setState({
          error: mcapErrorMessage(caughtError),
          frame: null,
          hasPreviewTopics: false,
          streamTopic: null,
          streamTopics: [],
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
      pool.release();
    };
  }, [enabled, selectedStreamTopic, source]);

  // This effect runs the hover playback loop: while playing, it keeps
  // requesting the next frame, wrapping back to the start when the
  // source runs out of frames.
  useEffect(() => {
    if (
      !playing ||
      !enabled ||
      !source ||
      state.status !== "ready" ||
      initialLoadInFlightRef.current
    ) {
      return undefined;
    }

    let active = true;
    const controller = new AbortController();
    const pool = getMcapGridPreviewPool();
    pool.acquire();
    let bootstrapPublished = false;
    let previousFrameTimeNs = frameTimeNsRef.current;
    let presentedAtMs = performance.now();

    const run = async () => {
      try {
        while (active) {
          if (initialLoadInFlightRef.current) {
            break;
          }

          const request = selectedStreamTopic
            ? {
                selectedStreamTopic,
                source,
                startTimeNs: nextStartTimeNsRef.current,
              }
            : {
                source,
                startTimeNs: nextStartTimeNsRef.current,
              };
          const result = await pool.request(request, {
            priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
            signal: controller.signal,
          });

          if (!active) {
            break;
          }

          if (!result.state.frame) {
            frameTimeNsRef.current = undefined;
            nextStartTimeNsRef.current = undefined;
            previousFrameTimeNs = undefined;
            await delayMs(
              mcapGridPreviewPlaybackDelayMs(undefined, undefined),
              controller.signal,
            );
            if (!active) {
              break;
            }
            continue;
          }

          const playbackDelayMs = mcapGridPreviewPlaybackDelayMs(
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
          setState(result.state);
          previousFrameTimeNs = result.frameTimeNs;
          presentedAtMs = performance.now();
        }
      } catch (caughtError) {
        if (active && !controller.signal.aborted) {
          setState((currentState) => ({
            ...currentState,
            error: mcapErrorMessage(caughtError),
            status: currentState.frame ? "ready" : "error",
          }));
        }
      }
    };

    void run();

    return () => {
      active = false;
      controller.abort();
      pool.release();
    };
  }, [enabled, playing, selectedStreamTopic, source, state.status]);

  return { ...state, pause, play };
}

function publishGridBootstrap(
  source: ByteSourceDescriptor,
  result: McapGridPreviewResult,
): void {
  if (!result.bootstrapTopics && !result.state.frame) {
    return;
  }

  publishMcapSourceBootstrap(source, {
    ...(result.bootstrapTopics ? { topics: result.bootstrapTopics } : {}),
    ...(result.state.frame
      ? {
          poster: result.state.frame,
          ...(result.state.streamTopic
            ? { posterTopic: result.state.streamTopic }
            : {}),
        }
      : {}),
  });
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

/** Status type exposed alongside the grid preview hook. */
export type { McapGridPreviewStatus };
