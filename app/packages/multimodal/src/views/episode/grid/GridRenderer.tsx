import type { SampleRendererProps } from "@fiftyone/plugins";
import { Size, Spinner } from "@voxel51/voodo";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BitmapCanvasHost,
  BitmapImageView,
  BitmapImageFrameView,
  type BitmapDrawSize,
} from "../../../visualization/media-2d/BitmapImageView";
import type { EpisodePosterFrame, EpisodePreviewReadResult } from "../../../ir";
import { retainedBinaryBytes } from "../../../runtime";
import { VideoPlaybackManager } from "../../../video/playback-manager";
import { PushVideoAccessUnitReader } from "../../../video/push-reader";
import { VideoPlaybackManagerProvider } from "../../../video/react";
import type { VideoStreamLease } from "../../../video/playback-manager";
import { PointCloudPanel } from "../../../visualization/composition";
import { acquireGridLiveLease } from "../../../visualization/webgpu/webgpu-live-lease";
import { renderPointCloudSnapshot } from "../../../visualization/scene-3d/gpu/webgpu-snapshot-renderer";
import { sampleDescriptorFromContext } from "../../session/episode-source";
import { useEpisodePreviewSession } from "../../session/use-episode-preview-session";
import { useStableEpisodeSource } from "../../session/use-stable-episode-source";
import classes from "./GridRenderer.module.css";
import { LoadingAscii } from "../shell/LoadingAscii";
import {
  GRID_STREAM_AUTO,
  useRegisterGridStreams,
  useGridSelectedStream,
} from "./grid-stream-state";
import { useGridCameraPose } from "./grid-camera-state";
import { cameraScopeKey } from "../shell/camera-scope";
import { useSampleRendererFirstMatch } from "../../../extensions/timeline";
import { useGridPreview, type GridPreviewStatus } from "./use-grid-preview";
import {
  getGridPosterCache,
  gridPosterCacheKey,
  gridPosterFreshness,
  pointCloudPoseKey,
  recordGridPosterDiagnostic,
  type GridPosterCacheEntry,
  type GridPosterFreshness,
} from "./grid-poster-cache";
import { captureGridPoster } from "./grid-poster-codec";
import type { PointCloudCameraPose } from "../../../visualization/scene-3d";

const IMAGE_FIT = "cover";
// Trailing debounce for shared-pose and cell-resize re-snapshots: orbiting
// the one hovered cell staleness-marks every visible point-cloud cell, so
// the debounce is what coalesces that churn into one serial snapshot burst.
const SNAPSHOT_REFRESH_DEBOUNCE_MS = 250;
/**
 * Hover-intent delay before a point-cloud cell requests a live-renderer lease.
 * Exported for tests.
 */
export const HOVER_INTENT_DELAY_MS = 120;
/** Dwell before hover playback starts, avoiding scroll-under-cursor churn. */
export const PLAYBACK_HOVER_INTENT_DELAY_MS = HOVER_INTENT_DELAY_MS;

const stopGridActivationPropagation = (
  event: React.MouseEvent<HTMLElement>,
) => {
  event.stopPropagation();
};

/**
 * Grid renderer for episode-backed multimodal samples. Shows one camera
 * preview frame and plays the stream while hovered.
 */
export function GridRenderer({
  ctx,
  isGridActive = true,
  onRetainedBytesChange,
}: SampleRendererProps) {
  const { byteSource: source, episodeSource } = useStableEpisodeSource(ctx);
  const gridCameraScopeKey =
    cameraScopeKey(ctx.dataset.datasetId, ctx.media?.field) ??
    ctx.dataset.datasetId;
  const [rootElement, setRootElement] = useState<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const visible = useGridRendererVisibility(rootElement, isGridActive);
  const sampleId = useMemo(() => {
    const sample = ctx.sample.sample as { _id?: string; id?: string };
    return sample._id ?? sample.id;
  }, [ctx.sample.sample]);
  const [selectedStream] = useGridSelectedStream(ctx.dataset.name);
  const selectedSourceName =
    selectedStream === GRID_STREAM_AUTO ? null : selectedStream;
  // A lasso/search in the embeddings panel posters this tile at its earliest
  // matched window, so both the requested time and preferred stream belong to
  // the poster cache identity.
  const firstMatch = useSampleRendererFirstMatch(ctx);
  const cacheKey = useMemo(
    () =>
      source
        ? gridPosterCacheKey({
            datasetId: ctx.dataset.datasetId,
            mediaField: ctx.media?.field,
            posterSourceName: firstMatch?.stream,
            posterStartTimeNs: firstMatch?.startNs,
            selectedSourceName,
            source,
          })
        : null,
    [
      ctx.dataset.datasetId,
      ctx.media?.field,
      firstMatch?.startNs,
      firstMatch?.stream,
      selectedSourceName,
      source,
    ],
  );
  const cachedPosterRef = useRef<{
    readonly entry: GridPosterCacheEntry | null;
    readonly key: string | null;
  }>({ entry: null, key: null });
  if (cachedPosterRef.current.key !== cacheKey) {
    cachedPosterRef.current = {
      entry: cacheKey ? getGridPosterCache().peek(cacheKey) : null,
      key: cacheKey,
    };
  }
  const cachedPoster = cachedPosterRef.current.entry;
  const recordedCacheLookupKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!cacheKey || recordedCacheLookupKeyRef.current === cacheKey) return;
    recordedCacheLookupKeyRef.current = cacheKey;
    if (cachedPoster) getGridPosterCache().touch(cacheKey);
    recordGridPosterDiagnostic(cachedPoster ? "hits" : "misses");
  }, [cacheKey, cachedPoster]);
  const [cameraPose, setCameraPose] = useGridCameraPose(
    gridCameraScopeKey,
    visible,
  );
  const rootSize = useElementCssSize(rootElement);
  const poseKey = pointCloudPoseKey(cameraPose);
  const freshness = useMemo<GridPosterFreshness | null>(
    () =>
      cachedPoster && rootSize
        ? gridPosterFreshness(cachedPoster, rootSize, poseKey)
        : null,
    [cachedPoster, poseKey, rootSize],
  );
  const previewSessionDemand = usePreviewSessionDemand({
    cacheKey,
    cachedPoster,
    freshness,
    hovered,
    visible,
  });
  const gridVideoPlayback = useGridVideoPlayback(source?.sourceId ?? null);
  const previewSession = useEpisodePreviewSession(
    sampleDescriptorFromContext(ctx),
    episodeSource,
    previewSessionDemand,
  );
  const preview = useGridPreview({
    cacheRequestKey: cacheKey,
    cachedPoster,
    enabled: visible,
    hovered,
    onReadResult: gridVideoPlayback.onReadResult,
    posterStartTimeNs: firstMatch?.startNs ?? null,
    posterSourceName: firstMatch?.stream ?? null,
    previewSession: previewSession.session,
    previewSessionError: previewSession.error,
    previewSessionStatus: previewSession.status,
    selectedSourceName,
    source,
  });
  const registerStreams = useRegisterGridStreams();
  const stableStreams = useStableGridStreams(preview.streamSourceNames);
  const sourceKind = preview.frame?.kind ?? preview.cachedPoster?.sourceKind;
  const blocksGridActivation = sourceKind === "point-cloud";
  const gridActivationHandler = blocksGridActivation
    ? stopGridActivationPropagation
    : undefined;
  const rootClassName = blocksGridActivation
    ? classes.root
    : `${classes.root} ${classes.modalActivationSurface}`;
  const playbackIntent = usePlaybackHoverIntent(
    preview.pause,
    preview.play,
    visible,
    setHovered,
  );
  const gridPosterDisplay = import.meta.env.DEV
    ? preview.cachedPoster && !preview.frame
      ? "cache"
      : preview.frame
        ? "source"
        : "empty"
    : undefined;
  const [surfaceRetention, setSurfaceRetention] = useState<{
    readonly bytes: number;
    readonly owner: EpisodePosterFrame | GridPosterCacheEntry;
  } | null>(null);
  const displayOwner = preview.frame ?? preview.cachedPoster;
  const surfaceRetainedBytes =
    surfaceRetention && surfaceRetention.owner === displayOwner
      ? surfaceRetention.bytes
      : 0;
  const handleSurfaceRetainedBytesChange = useCallback(
    (bytes: number) => {
      const owner = displayOwner;
      if (owner) {
        setSurfaceRetention((current) =>
          current?.owner === owner && current.bytes === bytes
            ? current
            : { bytes, owner },
        );
      }
    },
    [displayOwner],
  );
  const capturedTokensRef = useRef(new Set<string>());
  useEffect(() => {
    capturedTokensRef.current.clear();
  }, [cacheKey]);
  const handlePosterCanvasCommitted = useCallback(
    (
      capturedSourceKind: "image" | "point-cloud",
      canvas: HTMLCanvasElement,
      size: BitmapDrawSize,
      snapshotPoseKey?: string,
    ) => {
      if (!cacheKey) return;
      const capturePoseKey =
        capturedSourceKind === "point-cloud" ? snapshotPoseKey : undefined;
      if (capturedSourceKind === "point-cloud" && !capturePoseKey) return;
      const token = JSON.stringify([
        capturedSourceKind,
        capturePoseKey ?? null,
        size.width,
        size.height,
      ]);
      if (capturedTokensRef.current.has(token)) return;
      capturedTokensRef.current.add(token);
      captureGridPoster({
        entry: {
          height: size.height,
          mimeType: "image/webp",
          ...(capturePoseKey ? { pointCloudPoseKey: capturePoseKey } : {}),
          sourceKind: capturedSourceKind,
          streamId: preview.streamId,
          streamSourceName: preview.streamSourceName,
          streamSourceNames: preview.streamSourceNames,
          width: size.width,
        },
        key: cacheKey,
        source: canvas,
      });
    },
    [
      cacheKey,
      preview.streamId,
      preview.streamSourceName,
      preview.streamSourceNames,
    ],
  );

  // This effect keeps the grid cache's retained-byte estimate current.
  useEffect(() => {
    onRetainedBytesChange?.(
      retainedBinaryBytes(preview.frame) + surfaceRetainedBytes,
    );
  }, [onRetainedBytesChange, preview.frame, surfaceRetainedBytes]);

  // This effect registers the sample's previewable streams for grid controls.
  useEffect(() => {
    return registerStreams({
      datasetName: ctx.dataset.name,
      sampleId,
      streams: stableStreams.streams,
    });
  }, [ctx.dataset.name, registerStreams, sampleId, stableStreams]);

  return (
    <div
      className={rootClassName}
      data-grid-poster-display={gridPosterDisplay}
      onClick={gridActivationHandler}
      onContextMenu={gridActivationHandler}
      onPointerEnter={playbackIntent.enter}
      onPointerLeave={playbackIntent.leave}
      ref={setRootElement}
    >
      {preview.frame ? (
        <VideoPlaybackManagerProvider manager={gridVideoPlayback.manager}>
          <PreviewFrame
            // Image dimensions are per camera stream; remount to drop stale
            // dimensions when the source or selected stream changes.
            key={`${source?.sourceId ?? ""}:${preview.streamId ?? ""}`}
            active={visible}
            cachedPoster={preview.cachedPoster}
            cameraPose={cameraPose}
            frame={preview.frame}
            hovered={hovered}
            onCameraPoseChange={setCameraPose}
            onCanvasCommitted={handlePosterCanvasCommitted}
            onSurfaceRetainedBytesChange={handleSurfaceRetainedBytesChange}
            videoStream={preview.streamId}
          />
        </VideoPlaybackManagerProvider>
      ) : preview.cachedPoster ? (
        <BitmapImageView
          bytes={preview.cachedPoster.bytes}
          className={classes.imagePanel}
          fit={IMAGE_FIT}
          mimeType={preview.cachedPoster.mimeType}
          onBitmapRetainedBytesChange={handleSurfaceRetainedBytesChange}
        />
      ) : (
        <PreviewStatus
          error={preview.error}
          hasPreviewStreams={preview.hasPreviewStreams}
          status={preview.status}
        />
      )}
      {preview.frame && preview.isBuffering ? (
        <span
          className={classes.bufferingIndicator}
          data-testid="episode-grid-buffering-indicator"
        >
          <Spinner size={Size.Xs} />
        </span>
      ) : null}
    </div>
  );
}

interface GridVideoPlaybackController {
  readonly leases: Map<string, VideoStreamLease>;
  readonly manager: VideoPlaybackManager;
  readonly reader: PushVideoAccessUnitReader;
  readonly sourceKey: string;
}

/**
 * Pushes every H.264 access unit into one mounted source/stream engine, even
 * when the 12fps grid presentation policy skips the corresponding React
 * frame. The bitmap consumer then subscribes to that same engine.
 */
function useGridVideoPlayback(sourceKey: string | null): {
  readonly manager: VideoPlaybackManager | null;
  readonly onReadResult: (result: EpisodePreviewReadResult) => void;
} {
  const controllerRef = useRef<GridVideoPlaybackController | null>(null);
  const [binding, setBinding] = useState<GridVideoPlaybackController | null>(
    null,
  );
  const manager = binding?.sourceKey === sourceKey ? binding.manager : null;

  useEffect(() => {
    if (!sourceKey) {
      controllerRef.current = null;
      setBinding(null);
      return undefined;
    }
    const manager = new VideoPlaybackManager(`grid:${sourceKey}`);
    const reader = new PushVideoAccessUnitReader();
    manager.setReader(reader);
    const controller: GridVideoPlaybackController = {
      leases: new Map(),
      manager,
      reader,
      sourceKey,
    };
    controllerRef.current = controller;
    setBinding(controller);
    return () => {
      if (controllerRef.current === controller) controllerRef.current = null;
      for (const lease of controller.leases.values()) lease.release();
      controller.leases.clear();
      controller.manager.close();
      controller.reader.clear();
      setBinding((current) => (current === controller ? null : current));
    };
  }, [sourceKey]);

  const onReadResult = useCallback((result: EpisodePreviewReadResult) => {
    const controller = controllerRef.current;
    const image = result.frame?.kind === "image" ? result.frame.image : null;
    const stream = result.streamId;
    if (
      !controller ||
      !image ||
      image.kind !== "encoded-video" ||
      image.codec !== "h264" ||
      image.h264.hasFrame === false ||
      !stream
    ) {
      return;
    }
    const timeNs = image.timestampNs ?? result.frameTimeNs;
    if (timeNs === undefined) return;
    controller.reader.push(stream, { frame: image, timeNs });

    let lease = controller.leases.get(stream);
    if (!lease) {
      for (const previous of controller.leases.values()) previous.release();
      controller.leases.clear();
      lease = controller.manager.acquire(stream);
      controller.leases.set(stream, lease);
    }
  }, []);

  return { manager, onReadResult };
}

function useGridRendererVisibility(
  element: HTMLDivElement | null,
  gridActive: boolean,
): boolean {
  const [intersecting, setIntersecting] = useState(false);

  // This effect tracks whether the mounted renderer is near the grid viewport.
  useEffect(() => {
    if (!element || !gridActive) {
      setIntersecting(false);
      return undefined;
    }
    if (typeof IntersectionObserver === "undefined") {
      setIntersecting(element.isConnected);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) =>
        setIntersecting(entries.some((entry) => entry.isIntersecting)),
      // Start the worker shortly before a cell enters the viewport without
      // decoding the detached 200-item hidden cache.
      { rootMargin: "200px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, gridActive]);

  return gridActive && intersecting;
}

function useElementCssSize(
  element: HTMLDivElement | null,
): BitmapDrawSize | null {
  const [size, setSize] = useState<BitmapDrawSize | null>(null);
  useEffect(() => {
    if (!element) {
      setSize(null);
      return undefined;
    }
    const update = () => {
      const rect = element.getBoundingClientRect();
      const next = {
        height: Math.max(1, Math.round(rect.height)),
        width: Math.max(1, Math.round(rect.width)),
      };
      setSize((current) =>
        current?.height === next.height && current.width === next.width
          ? current
          : next,
      );
    };
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return size;
}

function usePreviewSessionDemand({
  cacheKey,
  cachedPoster,
  freshness,
  hovered,
  visible,
}: {
  readonly cacheKey: string | null;
  readonly cachedPoster: GridPosterCacheEntry | null;
  readonly freshness: GridPosterFreshness | null;
  readonly hovered: boolean;
  readonly visible: boolean;
}): boolean {
  const [latched, setLatched] = useState(false);
  const diagnosticRef = useRef<string | null>(null);
  useEffect(() => {
    setLatched(false);
    diagnosticRef.current = null;
  }, [cacheKey, visible]);
  useEffect(() => {
    if (visible && hovered && cachedPoster) {
      setLatched(true);
      recordGridPosterDiagnostic("sourceRefreshesHover");
    }
  }, [cachedPoster, hovered, visible]);
  useEffect(() => {
    if (!visible || !cachedPoster || !freshness) return;
    const diagnosticKey = `${cacheKey}:${freshness}`;
    if (diagnosticRef.current === diagnosticKey) return;
    diagnosticRef.current = diagnosticKey;
    if (freshness === "fresh") {
      recordGridPosterDiagnostic("staticHitsAvoidedSessionOpen");
    } else {
      recordGridPosterDiagnostic("staleHits");
      recordGridPosterDiagnostic(
        freshness === "stale-pose"
          ? "sourceRefreshesPose"
          : "sourceRefreshesSize",
      );
    }
  }, [cacheKey, cachedPoster, freshness, visible]);

  if (!visible) return false;
  if (!cachedPoster) return true;
  if (latched || hovered) return true;
  if (freshness === null) return false;
  return freshness !== "fresh";
}

function usePlaybackHoverIntent(
  pause: () => void,
  play: () => void,
  enabled: boolean,
  setHovered: (hovered: boolean) => void,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  const leave = useCallback(() => {
    cancel();
    setHovered(false);
    pause();
  }, [cancel, pause, setHovered]);
  const enter = useCallback(() => {
    cancel();
    if (!enabled) {
      return;
    }
    setHovered(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      play();
    }, PLAYBACK_HOVER_INTENT_DELAY_MS);
  }, [cancel, enabled, play, setHovered]);

  // This effect cancels hover playback when the grid becomes inactive.
  useEffect(() => {
    if (!enabled) {
      leave();
    }
    return cancel;
  }, [cancel, enabled, leave]);

  return { enter, leave };
}

function useStableGridStreams(streams: readonly string[]) {
  const previous = useRef({
    key: "",
    streams: [] as readonly string[],
  });

  return useMemo(() => {
    const normalizedStreams = Array.from(
      new Set(
        streams
          .map((stream) => stream.trim())
          .filter((stream) => stream.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b));
    const key = normalizedStreams.join("\0");

    if (previous.current.key !== key) {
      previous.current = { key, streams: normalizedStreams };
    }

    return previous.current;
  }, [streams]);
}

function PreviewFrame({
  active,
  cachedPoster,
  cameraPose,
  frame,
  hovered,
  onCameraPoseChange,
  onCanvasCommitted,
  onSurfaceRetainedBytesChange,
  videoStream,
}: {
  readonly active: boolean;
  readonly cachedPoster: GridPosterCacheEntry | null;
  readonly cameraPose: PointCloudCameraPose | null;
  readonly frame: EpisodePosterFrame;
  readonly hovered: boolean;
  readonly onCameraPoseChange: (pose: PointCloudCameraPose | null) => void;
  readonly onCanvasCommitted: (
    sourceKind: "image" | "point-cloud",
    canvas: HTMLCanvasElement,
    size: BitmapDrawSize,
    snapshotPoseKey?: string,
  ) => void;
  readonly onSurfaceRetainedBytesChange: (bytes: number) => void;
  readonly videoStream: string | null;
}) {
  return frame.kind === "point-cloud" ? (
    <PointCloudPreviewFrame
      active={active}
      cachedPoster={cachedPoster}
      cameraPose={cameraPose}
      frame={frame}
      hovered={hovered}
      onCameraPoseChange={onCameraPoseChange}
      onCanvasCommitted={onCanvasCommitted}
      onSurfaceRetainedBytesChange={onSurfaceRetainedBytesChange}
    />
  ) : (
    <ImagePreviewFrame
      frame={frame}
      onCanvasCommitted={onCanvasCommitted}
      onSurfaceRetainedBytesChange={onSurfaceRetainedBytesChange}
      videoStream={videoStream}
    />
  );
}

/**
 * Point-cloud preview cell: a static snapshot bitmap at rest (rendered by
 * the shared offscreen snapshot renderer — zero per-cell WebGPU devices),
 * with the real live `PointCloudPanel` mounted only while hovered AND
 * holding one of the pool's capped live-renderer leases.
 */
function PointCloudPreviewFrame({
  active,
  cachedPoster,
  cameraPose,
  frame,
  hovered,
  onCameraPoseChange,
  onCanvasCommitted,
  onSurfaceRetainedBytesChange,
}: {
  readonly active: boolean;
  readonly cachedPoster: GridPosterCacheEntry | null;
  readonly cameraPose: PointCloudCameraPose | null;
  readonly frame: Extract<EpisodePosterFrame, { kind: "point-cloud" }>;
  readonly hovered: boolean;
  readonly onCameraPoseChange: (pose: PointCloudCameraPose | null) => void;
  readonly onCanvasCommitted: (
    sourceKind: "image" | "point-cloud",
    canvas: HTMLCanvasElement,
    size: BitmapDrawSize,
    snapshotPoseKey?: string,
  ) => void;
  readonly onSurfaceRetainedBytesChange: (bytes: number) => void;
}) {
  // Only active/visible cells subscribe to the shared pose. Hidden cached
  // roots keep their last bitmap and catch up lazily when reattached.
  // Two-step live gate: `wantsLive` flips once the pointer has dwelled
  // past the intent delay; `live` flips only once the lease pool grants
  // this cell one of its capped live-renderer slots.
  const [wantsLive, setWantsLive] = useState(false);
  const [live, setLive] = useState(false);
  // Stable per-mount holder id keeps lease acquisition idempotent across
  // StrictMode's double-invoked effects.
  const holderId = useId();
  const intentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [snapshot, setSnapshot] = useState<{
    readonly bitmap: ImageBitmap;
    readonly poseKey: string;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inFlightRef = useRef<AbortController | null>(null);
  const layers = useMemo(
    () => [{ frame: frame.pointCloud, id: "preview" }],
    [frame.pointCloud],
  );
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const cameraPoseRef = useRef(cameraPose);
  cameraPoseRef.current = cameraPose;
  const activeRef = useRef(active);
  activeRef.current = active;
  const liveRef = useRef(live);
  liveRef.current = live;

  const requestSnapshot = useCallback(() => {
    const root = rootRef.current;
    if (!root || !activeRef.current || liveRef.current) {
      return;
    }

    // Only the latest request per cell may commit: superseding aborts the
    // previous job (a still-queued job is dropped without rendering), and
    // the abort check below drops any late resolution.
    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;

    // Snapshot at the cell's CSS pixel size (DPR 1) so the host's
    // drawImage is 1:1 — no crop, no stretch; resizes re-snapshot instead
    // of rescaling. A null pose auto-fits exactly like the live panel, so
    // hover swaps don't jump.
    const rect = root.getBoundingClientRect();
    const snapshotPose = cameraPoseRef.current;
    const snapshotPoseKey = pointCloudPoseKey(snapshotPose);
    void renderPointCloudSnapshot({
      cameraPose: snapshotPose,
      height: rect.height,
      layers: layersRef.current,
      signal: controller.signal,
      width: rect.width,
    }).then((bitmap) => {
      if (!bitmap) {
        // Cancelled or failed: keep the previous frame visible.
        return;
      }
      if (controller.signal.aborted) {
        // Superseded (or unmounted) after the render finished.
        bitmap.close();
        return;
      }

      // The host adopts the bitmap and closes the one it replaces.
      setSnapshot({ bitmap, poseKey: snapshotPoseKey });
      onSurfaceRetainedBytesChange(bitmap.width * bitmap.height * 4);
    });
  }, [onSurfaceRetainedBytesChange]);

  const cancelHoverIntent = useCallback(() => {
    if (intentTimerRef.current !== null) {
      clearTimeout(intentTimerRef.current);
      intentTimerRef.current = null;
    }
  }, []);

  // A cached point-cloud poster can receive hover before the real frame
  // arrives. Derive live intent from the parent hover state so mounting the
  // point-cloud surface under an already-stationary pointer still upgrades.
  useEffect(() => {
    cancelHoverIntent();
    if (!active || !hovered) {
      setWantsLive(false);
      return undefined;
    }
    intentTimerRef.current = setTimeout(() => {
      intentTimerRef.current = null;
      setWantsLive(true);
    }, HOVER_INTENT_DELAY_MS);
    return cancelHoverIntent;
  }, [active, cancelHoverIntent, hovered]);

  // This effect holds this cell's live-renderer lease while the hover
  // intent stands: acquire on wants-live, release in the cleanup
  // (unhover or unmount). StrictMode's double-invoked effect is safe:
  // the interleaved cleanup releases, the re-run re-acquires, and the
  // pool is idempotent per holderId — the cell never holds two slots.
  useEffect(() => {
    if (!wantsLive) {
      return undefined;
    }

    const lease = acquireGridLiveLease(holderId, () => {
      // Stolen (a newer cell went live at the cap): unmount the live
      // panel immediately and refresh the snapshot at the current shared
      // pose — the snapshot host underneath is still mounted, so nothing
      // flashes.
      setLive(false);
    });
    if (lease === null) {
      // The live-renderer budget is full; stay on the snapshot.
      return undefined;
    }

    setLive(true);
    return () => {
      // No-op if this lease was already revoked by a steal.
      lease.release();
      setLive(false);
    };
  }, [holderId, wantsLive]);

  // This effect requests a snapshot immediately on mount and whenever the
  // preview frame content changes (content changes are discrete, so no
  // debounce).
  useEffect(() => {
    requestSnapshot();
  }, [active, frame.pointCloud, requestSnapshot]);

  const wasLiveRef = useRef(false);
  // This effect cancels redundant snapshots while live and refreshes once
  // after the cell returns to its resting bitmap.
  useEffect(() => {
    if (live) {
      wasLiveRef.current = true;
      inFlightRef.current?.abort();
      return;
    }
    if (wasLiveRef.current) {
      wasLiveRef.current = false;
      requestSnapshot();
    }
  }, [live, requestSnapshot]);

  // This effect re-snapshots (debounced) when the SHARED grid pose
  // changes — all point-cloud cells go stale together when any one is
  // orbited, and the trailing debounce coalesces the orbit stream into
  // one snapshot per cell once the pose settles. A hidden→active
  // transition is excluded: the mount effect above already snapshotted
  // at the freshly re-read pose, so a debounced follow-up would render
  // an identical duplicate.
  const previousPoseRef = useRef(cameraPose);
  const wasActiveRef = useRef(active);
  useEffect(() => {
    const previousPose = previousPoseRef.current;
    previousPoseRef.current = cameraPose;
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = active;
    if (previousPose === cameraPose || !wasActive) {
      return undefined;
    }

    if (!active || live) {
      return undefined;
    }

    const timer = setTimeout(requestSnapshot, SNAPSHOT_REFRESH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [active, cameraPose, live, requestSnapshot]);

  // This effect releases live/snapshot work when the cell leaves the viewport.
  useEffect(() => {
    if (active) {
      return;
    }
    cancelHoverIntent();
    setWantsLive(false);
    inFlightRef.current?.abort();
  }, [active, cancelHoverIntent]);

  // This effect re-snapshots (debounced) when the cell's layout size
  // changes, keeping the bitmap 1:1 with CSS pixels instead of rescaling.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let sawInitialObservation = false;
    const observer = new ResizeObserver(() => {
      // The observer fires once on observe; the mount effect already
      // requested that snapshot.
      if (!sawInitialObservation) {
        sawInitialObservation = true;
        return;
      }
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(requestSnapshot, SNAPSHOT_REFRESH_DEBOUNCE_MS);
    });
    observer.observe(root);
    return () => {
      observer.disconnect();
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [requestSnapshot]);

  // This effect cancels any pending hover intent and aborts any in-flight
  // snapshot on unmount (the lease itself is released by the lease
  // effect's own cleanup); the committed bitmap is closed by the host's
  // unmount cleanup.
  useEffect(() => {
    return () => {
      cancelHoverIntent();
      inFlightRef.current?.abort();
    };
  }, [cancelHoverIntent]);

  const pointCloudClassName = live
    ? `${classes.imagePanel} ${classes.pointCloud} ${classes.livePointCloud}`
    : `${classes.imagePanel} ${classes.pointCloud}`;

  return (
    <div className={pointCloudClassName} ref={rootRef}>
      {/* The snapshot host stays mounted UNDERNEATH the live panel while
          hovered so unhovering never flashes an empty cell. */}
      {!snapshot && cachedPoster ? (
        <BitmapImageView
          bytes={cachedPoster.bytes}
          className={classes.imagePanel}
          fit={IMAGE_FIT}
          mimeType={cachedPoster.mimeType}
          onBitmapRetainedBytesChange={onSurfaceRetainedBytesChange}
        />
      ) : null}
      <BitmapCanvasHost
        bitmap={snapshot?.bitmap ?? null}
        className={classes.imagePanel}
        fit={IMAGE_FIT}
        onCanvasCommitted={(canvas, size) =>
          onCanvasCommitted("point-cloud", canvas, size, snapshot?.poseKey)
        }
      />
      {live ? (
        // Hover comes alive — but only with one of the pool's capped
        // live-renderer leases; denied/stolen cells stay on the snapshot.
        <PointCloudPanel
          cameraPose={cameraPose}
          canvasSurface="grid-preview"
          className={classes.imagePanel}
          layers={layers}
          onCameraPoseChange={onCameraPoseChange}
          showControls={false}
          showGizmo={false}
          showHud={false}
          // The panel's own inline styles set position: relative, which
          // would beat the className and push it below the snapshot host;
          // this style prop wins instead so the live panel overlays it.
          style={{ inset: 0, position: "absolute" }}
        />
      ) : null}
    </div>
  );
}

function ImagePreviewFrame({
  frame,
  onCanvasCommitted,
  onSurfaceRetainedBytesChange,
  videoStream,
}: {
  readonly frame: Extract<EpisodePosterFrame, { kind: "image" }>;
  readonly onCanvasCommitted: (
    sourceKind: "image" | "point-cloud",
    canvas: HTMLCanvasElement,
    size: BitmapDrawSize,
  ) => void;
  readonly onSurfaceRetainedBytesChange: (bytes: number) => void;
  readonly videoStream: string | null;
}) {
  // GPU-free bitmap path: image preview cells hold zero WebGPU devices (the
  // modal's ImagePanel is untouched).
  return (
    <BitmapImageFrameView
      className={classes.imagePanel}
      fit={IMAGE_FIT}
      frame={frame.image}
      onCanvasCommitted={(canvas, size) =>
        onCanvasCommitted("image", canvas, size)
      }
      onBitmapRetainedBytesChange={onSurfaceRetainedBytesChange}
      videoSessionKey={videoStream ?? undefined}
    />
  );
}

function PreviewStatus({
  error,
  hasPreviewStreams,
  status,
}: {
  readonly error: string | null;
  readonly hasPreviewStreams: boolean;
  readonly status: GridPreviewStatus;
}) {
  const loading = status === "loading";
  const message = previewStatusMessage(status, hasPreviewStreams);

  return (
    <div className={classes.status}>
      <div className={classes.statusTitle}>
        {loading ? <LoadingAscii /> : null}
        {message ? <span>{message}</span> : null}
      </div>
      {error ? <div className={classes.error}>{error}</div> : null}
    </div>
  );
}

function previewStatusMessage(
  status: GridPreviewStatus,
  hasPreviewStreams: boolean,
): string | null {
  if (status === "loading") {
    return null;
  }

  if (status === "error") {
    return "Preview unavailable";
  }

  if (status === "unavailable") {
    return "No data available for this stream";
  }

  return hasPreviewStreams ? "No preview frames" : "No preview streams";
}
