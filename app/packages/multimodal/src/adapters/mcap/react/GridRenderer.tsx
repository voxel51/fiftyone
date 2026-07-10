import type { SampleRendererProps } from "@fiftyone/plugins";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { ImageAnnotationsOverlay } from "../../../visualization/panels/ImageAnnotationsOverlay";
import {
  BitmapCanvasHost,
  BitmapImageFrameView,
} from "../../../visualization/panels/bitmap-image-view";
import { PointCloudPanel } from "../../../visualization/panels/point-cloud";
import { acquireGridLiveLease } from "../../../visualization/panels/gpu/webgpu-live-lease";
import { renderPointCloudSnapshot } from "../../../visualization/panels/gpu/webgpu-snapshot-renderer";
import type { McapGridPreviewFrame } from "../grid-preview";
import classes from "./GridRenderer.module.css";
import { McapLoadingAscii } from "./McapLoadingAscii";
import {
  MCAP_GRID_STREAM_AUTO,
  useRegisterMcapGridStreamTopics,
  useMcapGridSelectedStreamTopic,
} from "./mcap-grid-stream-state";
import { useMcapGridCameraPose } from "./mcap-grid-camera-state";
import {
  useMcapGridPreview,
  type McapGridPreviewStatus,
} from "./use-mcap-grid-preview";
import { useStableMcapSource } from "./use-stable-mcap-source";

const IMAGE_FIT = "cover";
const GRID_ANNOTATION_STROKE_WIDTH = 1;
// Trailing debounce for shared-pose and cell-resize re-snapshots: orbiting
// the one hovered cell staleness-marks every visible point-cloud cell, so
// the debounce is what coalesces that churn into one serial snapshot burst.
const SNAPSHOT_REFRESH_DEBOUNCE_MS = 250;
// Hover-intent delay before a point-cloud cell requests a live-renderer
// lease: scroll-past must not thrash leases/renderers (device churn is
// exactly what the lease pool exists to prevent). Exported for tests.
export const HOVER_INTENT_DELAY_MS = 120;

const stopGridActivationPropagation = (
  event: React.MouseEvent<HTMLElement>,
) => {
  event.stopPropagation();
};

/**
 * Grid renderer for MCAP-backed multimodal samples. Shows one camera
 * preview frame and plays the stream while hovered.
 */
export function GridRenderer({ ctx }: SampleRendererProps) {
  const source = useStableMcapSource(ctx);
  const sampleId = useMemo(() => {
    const sample = ctx.sample.sample as { _id?: string; id?: string };
    return sample._id ?? sample.id;
  }, [ctx.sample.sample]);
  const [selectedStreamTopic] = useMcapGridSelectedStreamTopic(
    ctx.dataset.name,
  );
  const preview = useMcapGridPreview({
    selectedStreamTopic:
      selectedStreamTopic === MCAP_GRID_STREAM_AUTO
        ? null
        : selectedStreamTopic,
    source,
  });
  const registerStreamTopics = useRegisterMcapGridStreamTopics();
  const stableStreamTopics = useStableGridStreamTopics(preview.streamTopics);
  const allowGridActivation =
    preview.status === "ready" && preview.frame?.kind === "image";

  useEffect(() => {
    return registerStreamTopics({
      datasetName: ctx.dataset.name,
      sampleId,
      topics: stableStreamTopics.topics,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- registerStreamTopics is stable
  }, [ctx.dataset.name, sampleId, stableStreamTopics]);

  return (
    <div
      className={classes.root}
      onClick={allowGridActivation ? undefined : stopGridActivationPropagation}
      onContextMenu={
        allowGridActivation ? undefined : stopGridActivationPropagation
      }
      onPointerEnter={preview.play}
      onPointerLeave={preview.pause}
    >
      {preview.frame ? (
        <PreviewFrame
          // Image dimensions are per camera stream; remount to drop stale
          // dimensions when the source or selected topic changes.
          key={`${source?.sourceId ?? ""}:${preview.streamTopic ?? ""}`}
          frame={preview.frame}
        />
      ) : (
        <PreviewStatus
          error={preview.error}
          hasPreviewTopics={preview.hasPreviewTopics}
          status={preview.status}
        />
      )}
    </div>
  );
}

function useStableGridStreamTopics(topics: readonly string[]) {
  const previous = useRef({
    key: "",
    topics: [] as readonly string[],
  });

  return useMemo(() => {
    const normalizedTopics = Array.from(
      new Set(
        topics.map((topic) => topic.trim()).filter((topic) => topic.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b));
    const key = normalizedTopics.join("\0");

    if (previous.current.key !== key) {
      previous.current = { key, topics: normalizedTopics };
    }

    return previous.current;
  }, [topics]);
}

function PreviewFrame({ frame }: { readonly frame: McapGridPreviewFrame }) {
  return frame.kind === "point-cloud" ? (
    <PointCloudPreviewFrame frame={frame} />
  ) : (
    <ImagePreviewFrame frame={frame} />
  );
}

/**
 * Point-cloud preview cell: a static snapshot bitmap at rest (rendered by
 * the shared offscreen snapshot renderer — zero per-cell WebGPU devices),
 * with the real live `PointCloudPanel` mounted only while hovered AND
 * holding one of the pool's capped live-renderer leases.
 */
function PointCloudPreviewFrame({
  frame,
}: {
  readonly frame: Extract<McapGridPreviewFrame, { kind: "point-cloud" }>;
}) {
  // Subscribing to the shared pose atom re-renders every point-cloud cell
  // on each orbit tick of the hovered cell. That is cheap at rest (no
  // canvas, and the bitmap host no-ops on an unchanged bitmap); the
  // debounce below is what keeps actual snapshot WORK coalesced.
  const [cameraPose, setCameraPose] = useMcapGridCameraPose();
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

  const requestSnapshot = useCallback(() => {
    const root = rootRef.current;
    if (!root) {
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
    });
  }, []);

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
      requestSnapshot();
    });
    if (lease === null) {
      // Denied (Phase 3 budget policy): stay on the snapshot.
      return undefined;
    }

    setLive(true);
    return () => {
      // No-op if this lease was already revoked by a steal.
      lease.release();
      setLive(false);
    };
  }, [holderId, requestSnapshot, wantsLive]);

  // This effect requests a snapshot immediately on mount and whenever the
  // preview frame content changes (content changes are discrete, so no
  // debounce).
  useEffect(() => {
    requestSnapshot();
  }, [frame.pointCloud, requestSnapshot]);

  // This effect re-snapshots (debounced) when the SHARED grid pose
  // changes — all point-cloud cells go stale together when any one is
  // orbited, and the trailing debounce coalesces the orbit stream into
  // one snapshot per cell once the pose settles.
  const skipInitialPoseRef = useRef(true);
  useEffect(() => {
    if (skipInitialPoseRef.current) {
      skipInitialPoseRef.current = false;
      return undefined;
    }

    const timer = setTimeout(requestSnapshot, SNAPSHOT_REFRESH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [cameraPose, requestSnapshot]);

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

  return (
    <div
      className={classes.imagePanel}
      onPointerEnter={() => {
        // Arm the hover-intent timer; only a dwell past the delay asks
        // the pool for a live-renderer lease.
        cancelHoverIntent();
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
        if (live) {
          requestSnapshot();
        }
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
}: {
  readonly frame: Extract<McapGridPreviewFrame, { kind: "image" }>;
}) {
  const [imageDims, setImageDims] = useState<{
    width: number;
    height: number;
  } | null>(null);

  return (
    <>
      {/* GPU-free bitmap path: image preview cells hold zero WebGPU
          devices (the modal's ImagePanel is untouched). */}
      <BitmapImageFrameView
        className={classes.imagePanel}
        fit={IMAGE_FIT}
        frame={frame.image}
        onImageLoaded={(width, height) =>
          setImageDims((prev) =>
            prev?.width === width && prev?.height === height
              ? prev
              : { width, height },
          )
        }
      />
      {imageDims && frame.annotations ? (
        <div className={classes.annotationLayer}>
          <ImageAnnotationsOverlay
            annotations={[frame.annotations]}
            fit={IMAGE_FIT}
            imageHeight={imageDims.height}
            imageWidth={imageDims.width}
            strokeWidth={GRID_ANNOTATION_STROKE_WIDTH}
          />
        </div>
      ) : null}
    </>
  );
}

function PreviewStatus({
  error,
  hasPreviewTopics,
  status,
}: {
  readonly error: string | null;
  readonly hasPreviewTopics: boolean;
  readonly status: McapGridPreviewStatus;
}) {
  const loading = status === "loading";
  const message = previewStatusMessage(status, hasPreviewTopics);

  return (
    <div className={classes.status}>
      <div className={classes.statusTitle}>
        {loading ? <McapLoadingAscii /> : null}
        {message ? <span>{message}</span> : null}
      </div>
      {error ? <div className={classes.error}>{error}</div> : null}
    </div>
  );
}

function previewStatusMessage(
  status: McapGridPreviewStatus,
  hasPreviewTopics: boolean,
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

  return hasPreviewTopics ? "No preview frames" : "No preview streams";
}
