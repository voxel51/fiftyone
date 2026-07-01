import { useCallback, useEffect, useRef, useState } from "react";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import { mcapErrorMessage } from "../errors";
import {
  DEFAULT_MCAP_GRID_PREVIEW_PLAYBACK_RATE,
  MCAP_GRID_PREVIEW_IMAGE_FRAME_DELAY_MS,
  type McapGridPreviewSnapshot,
  type McapGridPreviewStatus,
} from "../grid-preview";
import { getMcapGridPreviewPool } from "../worker";

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
  selectedStreamTopic,
  source,
}: UseMcapGridPreviewOptions): McapGridPreviewState {
  const [state, setState] =
    useState<McapGridPreviewSnapshot>(IDLE_PREVIEW_STATE);
  const [playing, setPlaying] = useState(false);
  const initialLoadInFlightRef = useRef(false);
  const nextStartTimeNsRef = useRef<bigint | undefined>(undefined);
  const pause = useCallback(() => setPlaying(false), []);
  const play = useCallback(() => setPlaying(true), []);

  // This effect loads the initial preview frame for the current source and
  // holds a pool reference for the lifetime of the grid cell.
  useEffect(() => {
    if (!source) {
      initialLoadInFlightRef.current = false;
      nextStartTimeNsRef.current = undefined;
      setPlaying(false);
      setState(IDLE_PREVIEW_STATE);
      return undefined;
    }

    let active = true;
    const controller = new AbortController();
    const pool = getMcapGridPreviewPool();
    pool.acquire();
    initialLoadInFlightRef.current = true;
    nextStartTimeNsRef.current = undefined;
    setPlaying(false);
    setState({
      error: null,
      frame: null,
      hasPreviewTopics: false,
      streamTopic: null,
      streamTopics: [],
      status: "loading",
    });

    const request = selectedStreamTopic
      ? { selectedStreamTopic, source }
      : { source };
    pool
      .request(request, { signal: controller.signal })
      .then((result) => {
        if (active) {
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
  }, [selectedStreamTopic, source]);

  // This effect runs the hover playback loop: while playing, it keeps
  // requesting the next frame, wrapping back to the start when the
  // source runs out of frames.
  useEffect(() => {
    if (
      !playing ||
      !source ||
      state.status !== "ready" ||
      initialLoadInFlightRef.current
    ) {
      return;
    }

    let active = true;
    const controller = new AbortController();
    const pool = getMcapGridPreviewPool();

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
            signal: controller.signal,
          });

          if (!active) {
            break;
          }

          if (!result.state.frame) {
            nextStartTimeNsRef.current = undefined;
            await delayMs(playbackDelayMs());
            continue;
          }

          nextStartTimeNsRef.current = result.nextStartTimeNs;
          setState(result.state);
          await delayMs(playbackDelayMs(result.delayMs));
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
    };
  }, [playing, selectedStreamTopic, source, state.status]);

  return { ...state, pause, play };
}

function playbackDelayMs(
  frameDelayMs = MCAP_GRID_PREVIEW_IMAGE_FRAME_DELAY_MS,
): number {
  return Math.max(0, frameDelayMs / DEFAULT_MCAP_GRID_PREVIEW_PLAYBACK_RATE);
}

function delayMs(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export type { McapGridPreviewStatus };
