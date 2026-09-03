import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ByteSourceDescriptor,
  type EpisodePosterFrame,
  type EpisodePreviewNativeVideo,
  type EpisodePreviewReadResult,
} from "../../../ir";
import type { EpisodePreviewSession } from "../../../ports";
import {
  EpisodePreviewPlaybackScheduler,
  episodePreviewPlaybackDelayMs,
  publishEpisodePreviewBootstrap,
  recordPreviewSourceFacts,
  type SourceFactsScope,
} from "../../../runtime";
import { errorMessage } from "../status/error-message";
import type { GridPosterCacheEntry } from "./grid-poster-cache";

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
  readonly cachedPoster: GridPosterCacheEntry | null;
  readonly error: string | null;
  readonly frame: EpisodePosterFrame | null;
  readonly hasPreviewStreams: boolean;
  readonly nativeVideo: EpisodePreviewNativeVideo | null;
  readonly streamId: string | null;
  readonly streamSourceName: string | null;
  readonly streamSourceNames: readonly string[];
  readonly status: GridPreviewStatus;
}

/**
 * State returned by the episode grid preview hook.
 */
export interface GridPreviewState extends GridPreviewSnapshot {
  readonly isBuffering: boolean;
  readonly isPlaying: boolean;
  pause(): void;
  play(): void;
}

/**
 * Options for rendering one lightweight episode stream preview in the grid.
 */
export interface UseGridPreviewOptions {
  readonly cacheRequestKey?: string | null;
  /** Snapshot for `cacheRequestKey`; keep its identity stable while the key is unchanged. */
  readonly cachedPoster?: GridPosterCacheEntry | null;
  readonly enabled?: boolean;
  /** Whether this tile is the user's current interactive target. */
  readonly hovered?: boolean;
  /** Initial forward coverage required by the mounted video decoder. */
  readonly initialVideoDecodeLookaheadNs?: bigint;
  /** Receives every adapter result, including frames skipped by UI pacing. */
  readonly onReadResult?: (result: EpisodePreviewReadResult) => void;
  /** Capture time the still frame should show, instead of the recording
   * start. Set to an embeddings match so the tile posters at the match. */
  readonly posterStartTimeNs?: bigint | null;
  /** Stream the poster prefers once it is known previewable — a match on a
   * fused or non-previewable stream falls back to the automatic pick. */
  readonly posterSourceName?: string | null;
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
  readonly sourceFactsScope?: SourceFactsScope;
}

/** Suppresses buffering chrome for ordinary fast grid frame reads. */
export const GRID_BUFFERING_DELAY_MS = 150;

const IDLE_PREVIEW_STATE: GridPreviewSnapshot = {
  cachedPoster: null,
  error: null,
  frame: null,
  hasPreviewStreams: false,
  nativeVideo: null,
  streamId: null,
  streamSourceName: null,
  streamSourceNames: [],
  status: "idle",
} as const;

/**
 * Loads grid preview frames through a format-neutral preview session.
 * The first frame loads eagerly; `play`/`pause` (typically bound to hover)
 * advance playback from the last rendered frame.
 */
export function useGridPreview({
  cacheRequestKey = null,
  cachedPoster = null,
  enabled = true,
  hovered = false,
  initialVideoDecodeLookaheadNs,
  onReadResult,
  posterStartTimeNs = null,
  posterSourceName = null,
  previewSession,
  previewSessionError = null,
  previewSessionStatus = "idle",
  selectedSourceName,
  source,
  sourceFactsScope,
}: UseGridPreviewOptions): GridPreviewState {
  const [state, setState] = useState<GridPreviewSnapshot>(() =>
    seededSnapshot(source, cachedPoster),
  );
  const [stateOwnerKey, setStateOwnerKey] = useState(cacheRequestKey);
  const [playing, setPlaying] = useState(false);
  const cachedPosterRef = useRef(cachedPoster);
  cachedPosterRef.current = cachedPoster;
  // Bumped whenever the still-frame load below commits a fresh result
  // (a poster move included) — the hover loop depends on it so a poster
  // moving out from under an in-progress loop tears the stale loop down
  // and restarts against the new frame, rather than continuing to chain
  // frames from the old poster's timeline
  const [loadGeneration, setLoadGeneration] = useState(0);
  const initialLoadInFlightRef = useRef(false);
  // A poster stream this source turned out not to preview. Remembered so the
  // retry falls back to the auto pick instead of asking again forever.
  const refusedPosterSourceRef = useRef<string | null>(null);
  const [, setPosterRefusals] = useState(0);
  const onReadResultRef = useRef(onReadResult);
  onReadResultRef.current = onReadResult;
  const loadedRequestRef = useRef<{
    readonly posterStartTimeNs: bigint | null;
    readonly source: ByteSourceDescriptor;
    readonly sourceName: string | null;
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

  // A chosen stream is the only stream: episodes carry different cameras, and
  // drawing a substitute under the name of the one that was asked for
  // misrepresents which camera the tile shows. An absent stream stays blank.
  //
  // Only the automatic path substitutes, and only for the poster's preferred
  // stream — a match can land on a stream that is not previewable at all, and
  // there the alternative is no poster rather than the wrong camera. That
  // preference is asked for OUTRIGHT, never gated on `streamSourceNames`,
  // which is filled BY a completed read and so is empty on the first one.
  const posterRefused = refusedPosterSourceRef.current;
  const effectiveSourceName =
    selectedSourceName ??
    (posterSourceName && posterSourceName !== posterRefused
      ? posterSourceName
      : null);

  // This effect resets only when the source or the user's stream choice
  // changes. Visibility changes preserve the last frame so cache re-entry is
  // free, and a moved poster swaps in place rather than flashing a spinner at
  // every tile the next lasso touches.
  useEffect(() => {
    initialLoadInFlightRef.current = false;
    loadedRequestRef.current = null;
    frameTimeNsRef.current = undefined;
    nextStartTimeNsRef.current = undefined;
    // A refusal belongs to one source and one stream; carrying it across
    // either would keep falling back for a stream this source does preview
    refusedPosterSourceRef.current = null;
    finishBuffering();
    setPlaying(false);
    setStateOwnerKey(cacheRequestKey);
    setState(seededSnapshot(source, cachedPosterRef.current));
  }, [cacheRequestKey, finishBuffering, selectedSourceName, source]);

  // IndexedDB hydration completes after the cache key is already mounted.
  // Adopt that same-key poster in place without resetting a live frame or
  // starting a second preview read.
  useEffect(() => {
    if (!cachedPoster || stateOwnerKey !== cacheRequestKey) return;
    setState((current) => adoptCachedPoster(current, cachedPoster));
  }, [cacheRequestKey, cachedPoster, stateOwnerKey]);

  // This effect surfaces adapter failures and unsupported preview providers
  // without exposing format details to the grid.
  useEffect(() => {
    if (!source || previewSessionStatus === "idle") return;
    if (previewSessionStatus === "loading") {
      setState((current) =>
        current.frame || current.cachedPoster
          ? current
          : { ...current, status: "loading" },
      );
      return;
    }
    if (previewSessionStatus === "unavailable") {
      setState((current) => preservingCachedPoster(current, "unavailable"));
      return;
    }
    if (previewSessionStatus === "error") {
      setState((current) => ({
        ...preservingCachedPoster(current, "error"),
        error: previewSessionError ?? "Episode preview failed to open",
      }));
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
      loadedRequest.sourceName === effectiveSourceName &&
      loadedRequest.posterStartTimeNs === posterStartTimeNs
    ) {
      return undefined;
    }

    let active = true;
    const controller = new AbortController();
    initialLoadInFlightRef.current = true;
    frameTimeNsRef.current = undefined;
    nextStartTimeNsRef.current = undefined;

    const request = {
      ...(initialVideoDecodeLookaheadNs === undefined
        ? {}
        : { decodeLookaheadNs: initialVideoDecodeLookaheadNs }),
      ...(effectiveSourceName ? { sourceName: effectiveSourceName } : {}),
      ...(posterStartTimeNs === null ? {} : { startTimeNs: posterStartTimeNs }),
    };
    previewSession
      .read(request, {
        priority: hovered ? "current" : "idle",
        signal: controller.signal,
      })
      .then((result) => {
        if (active) {
          // The session says it cannot preview this stream. Now — with the
          // inventory it just returned — the auto pick is an informed
          // fallback rather than a guess made before anything was known.
          const willRetryWithAutoPick =
            result.status === "unavailable" &&
            selectedSourceName == null &&
            effectiveSourceName !== null &&
            effectiveSourceName === posterSourceName;
          if (willRetryWithAutoPick) {
            refusedPosterSourceRef.current = posterSourceName;
            setPosterRefusals((n) => n + 1);
          }
          notifyReadResult(onReadResultRef.current, result);
          publishEpisodePreviewBootstrap(source, result);
          if (sourceFactsScope) {
            recordPreviewSourceFacts(source, sourceFactsScope, result);
          }
          loadedRequestRef.current = {
            posterStartTimeNs,
            source,
            sourceName: effectiveSourceName,
          };
          frameTimeNsRef.current = result.frameTimeNs;
          nextStartTimeNsRef.current = result.nextStartTimeNs;
          if (willRetryWithAutoPick) {
            // A refusal that is about to be retried is not an outcome. Painting
            // it puts the terminal message on the tile for the length of one
            // read, between the spinner and the poster that does arrive.
            return;
          }

          setState((current) => resultPreservingCachedPoster(current, result));
          setLoadGeneration((g) => g + 1);
        }
      })
      .catch((caughtError) => {
        if (!active || controller.signal.aborted) {
          return;
        }

        // The tile can only show a sentence; the chain that produced it is
        // what makes a failure diagnosable
        console.error(
          "[multimodal] grid preview failed",
          { sourceName: effectiveSourceName },
          caughtError,
        );
        setState((current) => ({
          ...preservingCachedPoster(current, "error"),
          error: errorMessage(caughtError),
        }));
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
  }, [
    enabled,
    effectiveSourceName,
    hovered,
    initialVideoDecodeLookaheadNs,
    // Read when a refusal is recorded; `effectiveSourceName` already tracks
    // its value, so listing it changes nothing about when this runs
    posterSourceName,
    posterStartTimeNs,
    previewSession,
    source,
    sourceFactsScope,
  ]);

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
      state.nativeVideo !== null ||
      initialLoadInFlightRef.current
    ) {
      return undefined;
    }

    let active = true;
    const controller = new AbortController();
    let bootstrapPublished = false;
    let deferredSkippedFrame: {
      readonly result: EpisodePreviewReadResult;
    } | null = null;
    const playbackScheduler = new EpisodePreviewPlaybackScheduler();
    playbackScheduler.reset(frameTimeNsRef.current, performance.now());

    const presentResult = async (
      result: EpisodePreviewReadResult,
      playbackDelayMs: number,
    ): Promise<boolean> => {
      await delayMs(playbackDelayMs, controller.signal);
      if (!active) return false;

      if (!bootstrapPublished) {
        publishEpisodePreviewBootstrap(source, result);
        if (sourceFactsScope) {
          recordPreviewSourceFacts(source, sourceFactsScope, result);
        }
        bootstrapPublished = true;
      }

      frameTimeNsRef.current = result.frameTimeNs;
      nextStartTimeNsRef.current = result.nextStartTimeNs;
      setState((current) => resultPreservingCachedPoster(current, result));
      playbackScheduler.markPresented(result.frameTimeNs, performance.now());
      return true;
    };

    const run = async () => {
      try {
        while (active) {
          if (initialLoadInFlightRef.current) {
            break;
          }

          const request = effectiveSourceName
            ? {
                sourceName: effectiveSourceName,
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

          notifyReadResult(onReadResultRef.current, result);

          if (!result.frame) {
            if (deferredSkippedFrame) {
              const deferred = deferredSkippedFrame;
              const flushDelayMs =
                playbackScheduler.nextDelayMs(
                  deferred.result.frameTimeNs,
                  performance.now(),
                  true,
                ) ?? 0;
              if (!(await presentResult(deferred.result, flushDelayMs))) {
                break;
              }
              deferredSkippedFrame = null;
            }
            frameTimeNsRef.current = undefined;
            nextStartTimeNsRef.current = undefined;
            playbackScheduler.reset(undefined, performance.now());
            await delayMs(
              episodePreviewPlaybackDelayMs(undefined, undefined),
              controller.signal,
            );
            if (!active) {
              break;
            }
            continue;
          }

          const playbackDelayMs = playbackScheduler.nextDelayMs(
            result.frameTimeNs,
            performance.now(),
          );
          if (playbackDelayMs === null) {
            deferredSkippedFrame = { result };
            nextStartTimeNsRef.current = result.nextStartTimeNs;
            continue;
          }

          deferredSkippedFrame = null;
          if (!(await presentResult(result, playbackDelayMs))) {
            break;
          }
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
    effectiveSourceName,
    enabled,
    finishBuffering,
    loadGeneration,
    playing,
    previewSession,
    source,
    sourceFactsScope,
    startBuffering,
    state.status,
    state.nativeVideo,
  ]);

  const visibleState =
    stateOwnerKey === cacheRequestKey
      ? state
      : seededSnapshot(source, cachedPoster);
  return {
    ...visibleState,
    isBuffering,
    isPlaying: enabled && stateOwnerKey === cacheRequestKey && playing,
    pause,
    play,
  };
}

function seededSnapshot(
  source: ByteSourceDescriptor | null,
  cachedPoster: GridPosterCacheEntry | null,
): GridPreviewSnapshot {
  if (!source) return IDLE_PREVIEW_STATE;
  if (!cachedPoster) {
    return { ...IDLE_PREVIEW_STATE, status: "loading" };
  }
  return {
    cachedPoster,
    error: null,
    frame: null,
    hasPreviewStreams: cachedPoster.streamSourceNames.length > 0,
    nativeVideo: null,
    streamId: cachedPoster.streamId,
    streamSourceName: cachedPoster.streamSourceName,
    streamSourceNames: cachedPoster.streamSourceNames,
    status: "ready",
  };
}

function preservingCachedPoster(
  current: GridPreviewSnapshot,
  fallbackStatus: GridPreviewStatus,
): GridPreviewSnapshot {
  return current.cachedPoster
    ? current
    : { ...IDLE_PREVIEW_STATE, status: fallbackStatus };
}

function adoptCachedPoster(
  current: GridPreviewSnapshot,
  cachedPoster: GridPosterCacheEntry,
): GridPreviewSnapshot {
  if (current.cachedPoster === cachedPoster) return current;
  return {
    ...current,
    cachedPoster,
    error: current.frame ? current.error : null,
    hasPreviewStreams:
      current.hasPreviewStreams || cachedPoster.streamSourceNames.length > 0,
    streamId: current.streamId ?? cachedPoster.streamId,
    streamSourceName: current.streamSourceName ?? cachedPoster.streamSourceName,
    streamSourceNames:
      current.streamSourceNames.length > 0
        ? current.streamSourceNames
        : cachedPoster.streamSourceNames,
    status: current.frame ? current.status : "ready",
  };
}

function resultPreservingCachedPoster(
  current: GridPreviewSnapshot,
  result: EpisodePreviewReadResult,
): GridPreviewSnapshot {
  return {
    ...snapshotFromResult(result),
    cachedPoster: current.cachedPoster,
  };
}

function notifyReadResult(
  listener: UseGridPreviewOptions["onReadResult"],
  result: EpisodePreviewReadResult,
): void {
  if (!listener) return;
  try {
    listener(result);
  } catch (error) {
    const reportError = (
      globalThis as typeof globalThis & {
        reportError?: (reportedError: unknown) => void;
      }
    ).reportError;
    if (typeof reportError === "function") {
      reportError(error);
    } else {
      console.error("Grid preview result observer failed", error);
    }
  }
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

function snapshotFromResult(
  result: EpisodePreviewReadResult,
): GridPreviewSnapshot {
  const frame = result.frame;
  const timestampedFrame =
    frame?.kind === "image" &&
    frame.image.kind === "encoded-video" &&
    frame.image.timestampNs === undefined &&
    result.frameTimeNs !== undefined
      ? {
          ...frame,
          image: { ...frame.image, timestampNs: result.frameTimeNs },
        }
      : frame;
  return {
    cachedPoster: null,
    error: null,
    frame: timestampedFrame,
    hasPreviewStreams: result.streamSourceNames.length > 0,
    nativeVideo: result.nativeVideo ?? null,
    streamId: result.streamId,
    streamSourceName: result.streamSourceName,
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
