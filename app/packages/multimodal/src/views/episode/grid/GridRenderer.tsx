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
  BitmapImageFrameView,
} from "../../../visualization/image/bitmap-image-view";
import type { EpisodePosterFrame } from "../../../ir";
import { retainedBinaryBytes } from "../../../runtime";
import { PointCloudPanel } from "../../../visualization/composition";
import { acquireGridLiveLease } from "../../../visualization/webgpu/webgpu-live-lease";
import { renderPointCloudSnapshot } from "../../../visualization/scene-3d/gpu/webgpu-snapshot-renderer";
import { sampleDescriptorFromContext } from "../../episode-source";
import { useEpisodeGridPreview } from "../../use-episode-grid-preview";
import { useEpisodePreviewSession } from "../../use-episode-preview-session";
import { useStableEpisodeSource } from "../../use-stable-episode-source";
import classes from "./GridRenderer.module.css";
import { EpisodeLoadingAscii } from "../shell/EpisodeLoadingAscii";
import {
  EPISODE_GRID_STREAM_AUTO,
  useRegisterEpisodeGridStreams,
  useEpisodeGridSelectedStream,
} from "./episode-grid-stream-state";
import { useEpisodeGridCameraPose } from "./episode-grid-camera-state";
import { episodeCameraScopeKey } from "../shell/episode-camera-scope";
import type { EpisodeGridPreviewStatus } from "../../use-episode-grid-preview";

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
  const cameraScopeKey =
    episodeCameraScopeKey(ctx.dataset.datasetId, ctx.media?.field) ??
    ctx.dataset.datasetId;
  const [rootElement, setRootElement] = useState<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const visible = useGridRendererVisibility(rootElement, isGridActive);
  const sampleId = useMemo(() => {
    const sample = ctx.sample.sample as { _id?: string; id?: string };
    return sample._id ?? sample.id;
  }, [ctx.sample.sample]);
  const [selectedStream] = useEpisodeGridSelectedStream(ctx.dataset.name);
  const previewSession = useEpisodePreviewSession(
    sampleDescriptorFromContext(ctx),
    episodeSource,
    visible,
  );
  const preview = useEpisodeGridPreview({
    enabled: visible,
    hovered,
    previewSession: previewSession.session,
    previewSessionError: previewSession.error,
    previewSessionStatus: previewSession.status,
    selectedSourceName:
      selectedStream === EPISODE_GRID_STREAM_AUTO ? null : selectedStream,
    source,
  });
  const registerStreams = useRegisterEpisodeGridStreams();
  const stableStreams = useStableGridStreams(preview.streamSourceNames);
  const blocksGridActivation = preview.frame?.kind === "point-cloud";
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
  const [surfaceRetention, setSurfaceRetention] = useState<{
    readonly bytes: number;
    readonly frame: EpisodePosterFrame;
  } | null>(null);
  const surfaceRetainedBytes =
    surfaceRetention?.frame === preview.frame ? surfaceRetention.bytes : 0;
  const handleSurfaceRetainedBytesChange = useCallback(
    (bytes: number) => {
      const frame = preview.frame;
      if (frame) {
        setSurfaceRetention((current) =>
          current?.frame === frame && current.bytes === bytes
            ? current
            : { bytes, frame },
        );
      }
    },
    [preview.frame],
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
      onClick={gridActivationHandler}
      onContextMenu={gridActivationHandler}
      onPointerEnter={playbackIntent.enter}
      onPointerLeave={playbackIntent.leave}
      ref={setRootElement}
    >
      {preview.frame ? (
        <PreviewFrame
          // Image dimensions are per camera stream; remount to drop stale
          // dimensions when the source or selected stream changes.
          key={`${source?.sourceId ?? ""}:${preview.streamId ?? ""}`}
          active={visible}
          cameraScopeKey={cameraScopeKey}
          frame={preview.frame}
          onSurfaceRetainedBytesChange={handleSurfaceRetainedBytesChange}
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
  cameraScopeKey,
  frame,
  onSurfaceRetainedBytesChange,
}: {
  readonly active: boolean;
  readonly cameraScopeKey: string;
  readonly frame: EpisodePosterFrame;
  readonly onSurfaceRetainedBytesChange: (bytes: number) => void;
}) {
  return frame.kind === "point-cloud" ? (
    <PointCloudPreviewFrame
      active={active}
      cameraScopeKey={cameraScopeKey}
      frame={frame}
      onSurfaceRetainedBytesChange={onSurfaceRetainedBytesChange}
    />
  ) : (
    <ImagePreviewFrame
      frame={frame}
      onSurfaceRetainedBytesChange={onSurfaceRetainedBytesChange}
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
  cameraScopeKey,
  frame,
  onSurfaceRetainedBytesChange,
}: {
  readonly active: boolean;
  readonly cameraScopeKey: string;
  readonly frame: Extract<EpisodePosterFrame, { kind: "point-cloud" }>;
  readonly onSurfaceRetainedBytesChange: (bytes: number) => void;
}) {
  // Only active/visible cells subscribe to the shared pose. Hidden cached
  // roots keep their last bitmap and catch up lazily when reattached.
  const [cameraPose, setCameraPose] = useEpisodeGridCameraPose(
    cameraScopeKey,
    active,
  );
  // Two-step live gate: `wantsLive` flips once the pointer has dwelled
  // past the intent delay; `live` flips only once the lease pool grants
  // this cell one of its capped live-renderer slots.
  const [wantsLive, setWantsLive] = useState(false);
  const [live, setLive] = useState(false);
  // Stable per-mount holder id keeps lease acquisition idempotent across
  // StrictMode's double-invoked effects.
  const holderId = useId();
  const intentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [snapshot, setSnapshot] = useState<ImageBitmap | null>(null);
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
    void renderPointCloudSnapshot({
      cameraPose: cameraPoseRef.current,
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
      setSnapshot(bitmap);
      onSurfaceRetainedBytesChange(bitmap.width * bitmap.height * 4);
    });
  }, [onSurfaceRetainedBytesChange]);

  const cancelHoverIntent = useCallback(() => {
    if (intentTimerRef.current !== null) {
      clearTimeout(intentTimerRef.current);
      intentTimerRef.current = null;
    }
  }, []);

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
    <div
      className={pointCloudClassName}
      onPointerEnter={() => {
        // Arm the hover-intent timer; only a dwell past the delay asks
        // the pool for a live-renderer lease.
        cancelHoverIntent();
        if (!active) {
          return;
        }
        intentTimerRef.current = setTimeout(() => {
          intentTimerRef.current = null;
          setWantsLive(true);
        }, HOVER_INTENT_DELAY_MS);
      }}
      onPointerLeave={() => {
        // Back to rest: a pending intent is simply cancelled; if the cell
        // went live, dropping wantsLive releases the lease and unmounts
        // the panel (the lease effect's cleanup), and the snapshot is
        // refreshed at the pose the user left the shared camera in.
        cancelHoverIntent();
        setWantsLive(false);
      }}
      ref={rootRef}
    >
      {/* The snapshot host stays mounted UNDERNEATH the live panel while
          hovered so unhovering never flashes an empty cell. */}
      <BitmapCanvasHost bitmap={snapshot} fit={IMAGE_FIT} />
      {live ? (
        // Hover comes alive — but only with one of the pool's capped
        // live-renderer leases; denied/stolen cells stay on the snapshot.
        <PointCloudPanel
          cameraPose={cameraPose}
          canvasSurface="grid-preview"
          className={classes.imagePanel}
          layers={layers}
          onCameraPoseChange={setCameraPose}
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
  onSurfaceRetainedBytesChange,
}: {
  readonly frame: Extract<EpisodePosterFrame, { kind: "image" }>;
  readonly onSurfaceRetainedBytesChange: (bytes: number) => void;
}) {
  // GPU-free bitmap path: image preview cells hold zero WebGPU devices (the
  // modal's ImagePanel is untouched).
  return (
    <BitmapImageFrameView
      className={classes.imagePanel}
      fit={IMAGE_FIT}
      frame={frame.image}
      onBitmapRetainedBytesChange={onSurfaceRetainedBytesChange}
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
  readonly status: EpisodeGridPreviewStatus;
}) {
  const loading = status === "loading";
  const message = previewStatusMessage(status, hasPreviewStreams);

  return (
    <div className={classes.status}>
      <div className={classes.statusTitle}>
        {loading ? <EpisodeLoadingAscii /> : null}
        {message ? <span>{message}</span> : null}
      </div>
      {error ? <div className={classes.error}>{error}</div> : null}
    </div>
  );
}

function previewStatusMessage(
  status: EpisodeGridPreviewStatus,
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
