import { useCallback, useEffect, useRef, useState } from "react";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import { mcapErrorMessage } from "../errors";
import {
  mcapGridPreviewPlaybackDelayMs,
  type McapGridPreviewSnapshot,
  type McapGridPreviewStatus,
} from "../grid-preview";
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
          loadedRequestRef.current = { selectedStreamTopic, source };
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
            nextStartTimeNsRef.current = undefined;
            await delayMs(mcapGridPreviewPlaybackDelayMs(source));
            continue;
          }

          nextStartTimeNsRef.current = result.nextStartTimeNs;
          setState(result.state);
          await delayMs(mcapGridPreviewPlaybackDelayMs(source, result.delayMs));
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

function delayMs(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export type { McapGridPreviewStatus };
