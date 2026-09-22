import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  type ByteSourceDescriptor,
  type EpisodePosterFrame,
  type EpisodePreviewNativeVideo,
  type EpisodePreviewReadResult,
  type TimeWindow,
} from "../../../ir";
import type { EpisodePreviewSession } from "../../../ports";
import {
  EpisodePreviewPlaybackScheduler,
  episodePreviewPlaybackDelayMs,
  getEpisodeSeek,
  publishEpisodePlayhead,
  publishEpisodePreviewBootstrap,
  publishEpisodeTimeRange,
  recordPreviewSourceFacts,
  releaseEpisodePlayhead,
  releaseEpisodeSeek,
  subscribeEpisodeSeek,
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
  /** Codec of a selected stream nothing here can decode, when there is one. */
  readonly unsupportedCodec: string | null;
}

/**
 * State returned by the episode grid preview hook.
 */
export interface GridPreviewState extends GridPreviewSnapshot {
  readonly isBuffering: boolean;
  readonly isPlaying: boolean;
  pause(): void;
  play(): void;
  /**
   * Reports the instant a native-video surface is presenting, on its own media
   * clock. Native playback advances a media element rather than the read loop
   * below, so nothing else can keep the published playhead moving.
   */
  presentNativeTimeSeconds(mediaTimeSeconds: number): void;
  /**
   * Where a native-video surface has been asked to move to, on its own media
   * clock, or null when nothing has asked.
   *
   * A seek reaches the decoded-preview path by restarting its read loop from
   * the requested instant, which a media element has no equivalent of — the
   * element owns its own clock, so the request has to travel out to whoever
   * mounted it. Carries the request id so that asking twice for the same
   * instant is two seeks rather than one.
   */
  readonly nativeSeek: {
    readonly requestId: number;
    readonly timeSeconds: number;
  } | null;
}

/**
 * Options for rendering one lightweight episode stream preview in the grid.
 */
export interface UseGridPreviewOptions {
  readonly cacheRequestKey?: string | null;
  /** Snapshot for `cacheRequestKey`; keep its identity stable while the key is unchanged. */
  readonly cachedPoster?: GridPosterCacheEntry | null;
  readonly enabled?: boolean;
  /**
   * Episode identity the presented frame time is published under, for chrome
   * outside this tree that draws against the tile's playhead (the interval
   * lane). Omit to publish nothing.
   */
  readonly episodeId?: string | null;
  /** Whether this tile is the user's current interactive target. */
  readonly hovered?: boolean;
  /** Initial forward coverage required by the mounted video decoder. */
  readonly initialVideoDecodeLookaheadNs?: bigint;
  /** Receives every adapter result, including frames skipped by UI pacing. */
  readonly onReadResult?: (result: EpisodePreviewReadResult) => void;
  /** Capture time the still frame should show, instead of the recording
   * start. Set to an embeddings match so the tile posters at the match. */
  readonly posterStartTimeNs?: bigint | null;
  /** The stream an embeddings match names. Asked for outright; a stream the
   * session cannot preview (fused, unsupported) falls back to the automatic
   * pick. */
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
  unsupportedCodec: null,
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
  episodeId = null,
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
  const [refusedPosterSource, setRefusedPosterSource] = useState<string | null>(
    null,
  );
  const onReadResultRef = useRef(onReadResult);
  onReadResultRef.current = onReadResult;
  const loadedRequestRef = useRef<{
    readonly posterStartTimeNs: bigint | null;
    readonly source: ByteSourceDescriptor;
    readonly sourceName: string | null;
  } | null>(null);
  const frameTimeNsRef = useRef<bigint | undefined>(undefined);
  const episodeIdRef = useRef(episodeId);
  episodeIdRef.current = episodeId;
  // Which episode currently holds a published playhead. Tracked separately
  // from `episodeIdRef` because the tile can be pointed at a new episode while
  // the old one still owns a published value, and only the owner may be
  // released.
  const publishedOwnerRef = useRef<string | null>(null);
  // Every write to the presented-frame time goes through here so the published
  // playhead cannot drift from the ref the scheduler reads. Publishing to an
  // external store rather than into state is deliberate: the frame time
  // changes on every presented frame, and only the chrome that draws it should
  // re-render, never this tile.
  const setFrameTimeNs = useCallback((timeNs: bigint | undefined) => {
    frameTimeNsRef.current = timeNs;
    const id = episodeIdRef.current;
    // A stale owner is released here rather than only in the effect below,
    // because `episodeIdRef` is assigned during render: a frame presented
    // between the commit that changed the episode and the effect flush already
    // publishes under the new id, and the old one would otherwise never be
    // released by anything.
    const owner = publishedOwnerRef.current;
    if (owner !== null && owner !== id) {
      releaseEpisodePlayhead(owner);
      publishedOwnerRef.current = null;
    }
    if (!id) return;
    if (timeNs === undefined) {
      releaseEpisodePlayhead(id);
      publishedOwnerRef.current = null;
      return;
    }
    publishEpisodePlayhead(id, timeNs);
    publishedOwnerRef.current = id;
  }, []);

  // The preview read is what learns the episode's extent, so it is also what
  // publishes it — keyed by episode identity, the way the playhead above is
  // and the way the overlay and the interval sources read it back.
  const publishEpisodeRange = useCallback((range: TimeWindow | null) => {
    const id = episodeIdRef.current;
    if (!range || !id) return;
    publishEpisodeTimeRange(id, range);
  }, []);

  // Native playback (LeRobot MP4) advances a media element rather than the
  // read loop below, so the element's own clock is the only thing that knows
  // where the playhead is. The poster read anchors that clock: it presents the
  // frame the element reports at `startTimeSeconds`, so its absolute instant
  // plus the element's offset from that mark is the presented instant.
  const nativeAnchorRef = useRef<{
    readonly anchorNs: bigint;
    readonly startTimeSeconds: number;
  } | null>(null);
  const presentNativeTimeSeconds = useCallback(
    (mediaTimeSeconds: number) => {
      const anchor = nativeAnchorRef.current;
      if (!anchor) return;
      const offsetNs = Math.round(
        (mediaTimeSeconds - anchor.startTimeSeconds) * 1e9,
      );
      setFrameTimeNs(anchor.anchorNs + BigInt(offsetNs));
    },
    [setFrameTimeNs],
  );

  // This effect hands the playhead over when the tile is pointed at a new
  // episode. Without it the previous episode keeps a published instant nothing
  // is presenting any more, and the unmount cleanup below — which can only
  // release the current owner — would never reach it.
  useEffect(() => {
    const previous = publishedOwnerRef.current;
    if (previous === episodeId) return;
    if (previous !== null) {
      releaseEpisodePlayhead(previous);
      publishedOwnerRef.current = null;
    }
    // A frame retained while the tile had no episode identity still belongs to
    // the episode it is now pointed at, so the `null -> id` transition publishes
    // it rather than waiting for the next presented frame.
    const presented = frameTimeNsRef.current;
    if (episodeId && presented !== undefined) {
      publishEpisodePlayhead(episodeId, presented);
      publishedOwnerRef.current = episodeId;
    }
  }, [episodeId]);

  // This effect withdraws the playhead when the tile stops presenting, so the
  // lane never marks a position nothing is showing.
  useEffect(
    () => () => {
      const owner = publishedOwnerRef.current;
      if (owner) releaseEpisodePlayhead(owner);
    },
    [],
  );
  const nextStartTimeNsRef = useRef<bigint | undefined>(undefined);

  // Seek requests arrive from the interval lane, which is painted by the
  // grid's footer column and so has no React path to this tile. Same seam as
  // the playhead above, travelling the other way.
  const subscribeSeek = useCallback(
    (listener: () => void) =>
      episodeId ? subscribeEpisodeSeek(episodeId, listener) : () => undefined,
    [episodeId],
  );
  const seekRequest = useSyncExternalStore(
    subscribeSeek,
    () => (episodeId ? getEpisodeSeek(episodeId) : null),
    () => null,
  );
  const [seekGeneration, setSeekGeneration] = useState(0);
  // Read by the playback loop when it (re)starts: a seek has to re-anchor the
  // scheduler rather than carry the last presented frame's time across the
  // jump, which would bill the whole gap as playback debt and stall the tile.
  const seekPendingRef = useRef(false);
  const [nativeSeek, setNativeSeek] = useState<{
    readonly requestId: number;
    readonly timeSeconds: number;
  } | null>(null);
  const nativeVideoActive = state.nativeVideo !== null;
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

  // This effect applies a seek asked for from outside this tree — a click on
  // the interval lane. The request is withdrawn as it is applied, so that a
  // tile scrolled out and re-mounted against the same episode does not replay
  // a jump the user made minutes ago.
  //
  // Playback is started as well as moved: the lane can only be clicked while
  // the tile is hovered, which is the same gesture that plays it, so a tile
  // that lands on the requested instant and then sits frozen there would read
  // as the click having half worked.
  useEffect(() => {
    if (!enabled || !episodeId || !seekRequest) return;
    releaseEpisodeSeek(episodeId);

    if (nativeVideoActive) {
      const anchor = nativeAnchorRef.current;
      if (!anchor) return;
      setNativeSeek({
        requestId: seekRequest.requestId,
        timeSeconds:
          anchor.startTimeSeconds +
          Number(seekRequest.timestampNs - anchor.anchorNs) / 1e9,
      });
      setPlaying(true);
      return;
    }

    nextStartTimeNsRef.current = seekRequest.timestampNs;
    seekPendingRef.current = true;
    setPlaying(true);
    // Restarts the playback loop below, which aborts whatever read is in
    // flight and begins again from the instant just written.
    setSeekGeneration((generation) => generation + 1);
  }, [enabled, episodeId, nativeVideoActive, seekRequest]);

  // This effect withdraws an unapplied request when the tile stops presenting.
  useEffect(
    () => () => {
      if (episodeId) releaseEpisodeSeek(episodeId);
    },
    [episodeId],
  );

  // Asked for outright, never gated on `streamSourceNames`: that array is
  // filled BY a completed read, so on the first one it is empty and the
  // match's stream would be dropped for an auto-picked camera.
  const effectiveSourceName =
    selectedSourceName ??
    (posterSourceName && posterSourceName !== refusedPosterSource
      ? posterSourceName
      : null);

  // This effect resets only when the source or the user's stream choice
  // changes. Visibility changes preserve the last frame so cache re-entry is
  // free, and a moved poster swaps in place rather than flashing a spinner at
  // every tile the next lasso touches.
  useEffect(() => {
    initialLoadInFlightRef.current = false;
    loadedRequestRef.current = null;
    setFrameTimeNs(undefined);
    nextStartTimeNsRef.current = undefined;
    // A refusal belongs to one source and one stream; carrying it across
    // either would keep falling back for a stream this source does preview
    setRefusedPosterSource(null);
    // A native seek is a time on THIS source's timeline, anchored to this
    // episode. Carrying it across an identity change would hand the next
    // preview a target computed against media it is not playing.
    setNativeSeek(null);
    finishBuffering();
    setPlaying(false);
    setStateOwnerKey(cacheRequestKey);
    setState(seededSnapshot(source, cachedPosterRef.current));
  }, [
    cacheRequestKey,
    finishBuffering,
    selectedSourceName,
    setFrameTimeNs,
    source,
  ]);

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
    setFrameTimeNs(undefined);
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
          // A different stream answered than was asked for: the refusal.
          // Not the status, which also reports a window the RIGHT stream
          // carries no frame in — falling back there shows another camera.
          if (
            effectiveSourceName &&
            effectiveSourceName !== selectedSourceName &&
            result.streamSourceName !== effectiveSourceName
          ) {
            setRefusedPosterSource(effectiveSourceName);
          }
          notifyReadResult(onReadResultRef.current, result);
          publishEpisodeRange(publishEpisodePreviewBootstrap(source, result));
          if (sourceFactsScope) {
            recordPreviewSourceFacts(source, sourceFactsScope, result);
          }
          loadedRequestRef.current = {
            posterStartTimeNs,
            source,
            sourceName: effectiveSourceName,
          };
          nativeAnchorRef.current =
            result.nativeVideo && result.frameTimeNs !== undefined
              ? {
                  anchorNs: result.frameTimeNs,
                  startTimeSeconds: result.nativeVideo.startTimeSeconds,
                }
              : null;
          setFrameTimeNs(result.frameTimeNs);
          // A seek asked for while this read was in flight already wrote the
          // instant the playback loop is to start from — and the loop has not
          // run yet, because it waits out the initial load. The frame this
          // read answered with sits before the jump, so taking its successor
          // here would start playback where the click was not.
          if (!seekPendingRef.current) {
            nextStartTimeNsRef.current = result.nextStartTimeNs;
          }
          setState((current) => resultPreservingCachedPoster(current, result));
          setLoadGeneration((g) => g + 1);
        }
      })
      .catch((caughtError) => {
        if (!active || controller.signal.aborted) {
          return;
        }

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
    effectiveSourceName,
    enabled,
    hovered,
    initialVideoDecodeLookaheadNs,
    posterStartTimeNs,
    previewSession,
    publishEpisodeRange,
    selectedSourceName,
    setFrameTimeNs,
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
    // A seek starts a fresh anchor: the frame last presented is on the far
    // side of the jump, and pacing the next one against it would ask the loop
    // to wait out the whole gap before showing anything.
    const seeked = seekPendingRef.current;
    seekPendingRef.current = false;
    playbackScheduler.reset(
      seeked ? undefined : frameTimeNsRef.current,
      performance.now(),
    );

    const presentResult = async (
      result: EpisodePreviewReadResult,
      playbackDelayMs: number,
    ): Promise<boolean> => {
      await delayMs(playbackDelayMs, controller.signal);
      if (!active) return false;

      if (!bootstrapPublished) {
        publishEpisodeRange(publishEpisodePreviewBootstrap(source, result));
        if (sourceFactsScope) {
          recordPreviewSourceFacts(source, sourceFactsScope, result);
        }
        bootstrapPublished = true;
      }

      setFrameTimeNs(result.frameTimeNs);
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
            setFrameTimeNs(undefined);
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
    publishEpisodeRange,
    seekGeneration,
    setFrameTimeNs,
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
    nativeSeek,
    pause,
    play,
    presentNativeTimeSeconds,
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
    unsupportedCodec: null,
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
    unsupportedCodec: result.unsupportedCodec ?? null,
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
