import { Icon, IconName, Size } from "@voxel51/voodo";
import { useEffect, useMemo, useState } from "react";

import { Base3DScene } from "../base-3d-scene";
import { WebGpuCanvas } from "../webgpu-canvas";
import {
  PERSPECTIVE_POINT_CAMERA,
  cameraPoseForBounds,
  sceneBoundsForLayers,
} from "./camera-fit-bounds";
import { CameraFrustumSceneLayer } from "./CameraFrustumSceneLayer";
import { GridSceneLayer } from "./GridSceneLayer";
import { NOTICE_SEVERITY_ICON_COLORS, styles } from "./panel-styles";
import {
  DEFAULT_MAX_RENDERED_POINTS,
  buildPointCloudRenderData,
} from "./point-cloud-colors";
import { PointCloudSceneLayer } from "./PointCloudSceneLayer";
import { SceneAnnotationLayer } from "./SceneAnnotationLayer";
import type {
  PanelNotice,
  PanelNoticeSeverity,
  PointCloudCameraPose,
  PointCloudPanelProps,
} from "./types";
import { EMPTY_NOTICES, annotationPrimitiveSummaryForLayers } from "./utils";

// Default WebGL point sprite size in pixels.
const DEFAULT_POINT_SIZE = 2;

/**
 * Production point-cloud visualization panel backed by a stable Three.js
 * canvas. All layers share one scene and one camera, so multiple sensor
 * streams compose into a single fused view.
 */
export function PointCloudPanel({
  annotationLayers = [],
  cameraPose,
  canvasSurface,
  className,
  colorBy,
  fit = "initial",
  frustumLayers = [],
  gridLayers = [],
  hudLines = [],
  layers,
  maxRenderedPoints = DEFAULT_MAX_RENDERED_POINTS,
  notices = EMPTY_NOTICES,
  onCameraPoseChange,
  onRenderStats,
  pointSize = DEFAULT_POINT_SIZE,
  showGizmo = true,
  showHud = true,
  style,
}: PointCloudPanelProps) {
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const renderLayers = useMemo(
    () =>
      layers.map((layer) => ({
        data: buildPointCloudRenderData(
          layer.frame.positions,
          maxRenderedPoints,
          {
            colorBy,
            colors: layer.frame.colors,
            scalarFields: layer.frame.scalarFields,
          },
        ),
        layer,
      })),
    [colorBy, layers, maxRenderedPoints],
  );

  const frameFitPose = useMemo(
    () =>
      cameraPoseForBounds(
        sceneBoundsForLayers(renderLayers, annotationLayers, gridLayers),
      ),
    [annotationLayers, gridLayers, renderLayers],
  );
  const [initialFitPose, setInitialFitPose] =
    useState<PointCloudCameraPose | null>(null);

  // This effect captures the first fitted camera pose for initial-fit mode and
  // clears it when the panel switches to another fit policy.
  useEffect(() => {
    if (fit !== "initial") {
      if (initialFitPose) setInitialFitPose(null);
      return;
    }
    if (!initialFitPose && frameFitPose) {
      setInitialFitPose(frameFitPose);
    }
  }, [fit, frameFitPose, initialFitPose]);

  const fittedCameraPose =
    fit === "never"
      ? null
      : fit === "frame"
        ? frameFitPose
        : (initialFitPose ?? frameFitPose);
  const effectiveCameraPose = cameraPose ?? fittedCameraPose;
  const cameraPoseSource = cameraPose
    ? "controlled"
    : fittedCameraPose
      ? "fitted"
      : "none";

  const finitePointCount = renderLayers.reduce(
    (sum, layer) => sum + layer.data.finitePointCount,
    0,
  );
  const declaredPointCount = layers.reduce(
    (sum, layer) => sum + layer.frame.pointCount,
    0,
  );
  const annotationEntityCount = annotationLayers.reduce(
    (sum, layer) => sum + layer.frame.entities.length,
    0,
  );
  const annotationPrimitiveSummary = useMemo(
    () => annotationPrimitiveSummaryForLayers(annotationLayers),
    [annotationLayers],
  );
  const annotationCubeCount = annotationPrimitiveSummary.cubeCount;
  const annotationPrimitiveCount = annotationPrimitiveSummary.totalCount;
  const hasPointCloudLayers = layers.length > 0;
  const hasSceneLayers =
    hasPointCloudLayers ||
    annotationLayers.length > 0 ||
    gridLayers.length > 0 ||
    frustumLayers.length > 0;
  useEffect(() => {
    if (!onRenderStats || !hasSceneLayers) return;

    const frame = requestAnimationFrame(() => {
      onRenderStats({
        annotationCubeCount,
        annotationEntityCount,
        annotationLayerCount: annotationLayers.length,
        annotationPrimitiveCount,
        ...(effectiveCameraPose ? { cameraPose: effectiveCameraPose } : {}),
        cameraPoseSource,
        declaredPointCount,
        finitePointCount,
        frustumLayerCount: frustumLayers.length,
        gridLayerCount: gridLayers.length,
        layerCount: layers.length,
        renderedPointCount: renderLayers.reduce(
          (sum, layer) => sum + layer.data.renderedPointCount,
          0,
        ),
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [
    annotationCubeCount,
    annotationEntityCount,
    annotationLayers.length,
    annotationPrimitiveCount,
    declaredPointCount,
    effectiveCameraPose,
    finitePointCount,
    cameraPoseSource,
    frustumLayers.length,
    gridLayers.length,
    hasSceneLayers,
    layers.length,
    onRenderStats,
    renderLayers,
  ]);

  return (
    <div className={className} style={{ ...styles.panel, ...style }}>
      <WebGpuCanvas
        camera={PERSPECTIVE_POINT_CAMERA}
        onError={setCanvasError}
        role="img"
        style={styles.canvas}
        surface={canvasSurface}
      >
        <Base3DScene
          cameraPose={effectiveCameraPose}
          onCameraPoseChange={onCameraPoseChange}
          showGizmo={showGizmo}
        >
          {gridLayers.map((layer, index) => (
            <GridSceneLayer
              key={layer.id}
              layer={layer}
              renderOrder={index - gridLayers.length}
            />
          ))}
          {renderLayers.map(({ data, layer }) => (
            <PointCloudSceneLayer
              key={layer.id}
              data={data}
              layer={layer}
              pointSize={pointSize}
            />
          ))}
          {annotationLayers.map((layer) => (
            <SceneAnnotationLayer key={layer.id} layer={layer} />
          ))}
          {frustumLayers.map((layer) => (
            <CameraFrustumSceneLayer key={layer.id} layer={layer} />
          ))}
        </Base3DScene>
      </WebGpuCanvas>

      {canvasError ? (
        <div style={styles.status}>{canvasError}</div>
      ) : hasPointCloudLayers &&
        finitePointCount === 0 &&
        annotationPrimitiveCount === 0 ? (
        <div style={styles.status}>No finite points</div>
      ) : null}
      {!canvasError && showHud && hudLines.length > 0 ? (
        <div style={styles.hud}>
          {hudLines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      ) : null}
      <PanelNotices notices={notices} />
    </div>
  );
}

/** Worst severity across the chip's notices; drives the icon color only. */
function worstNoticeSeverity(
  notices: readonly PanelNotice[],
): PanelNoticeSeverity {
  let worst: PanelNoticeSeverity = "info";
  for (const notice of notices) {
    if (notice.severity === "error") return "error";
    if (notice.severity === "warning") worst = "warning";
  }
  return worst;
}

/**
 * Collapsed-by-default diagnostics chip in the panel's bottom-left
 * corner. Transform/placement notices are informative but verbose, so
 * the resting state is a warning glyph plus a count; the full messages
 * expand on demand.
 *
 * Rows are keyed by notice id, so a notice whose detail text updates per
 * playback tick edits its row in place instead of remounting it.
 */
function PanelNotices({
  notices,
}: {
  readonly notices: readonly PanelNotice[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (notices.length === 0) {
    return null;
  }

  return (
    <div style={styles.notices}>
      {expanded ? (
        <ul aria-label="3D scene notices" style={styles.noticesList}>
          {notices.map((notice) => (
            <li key={notice.id} style={styles.noticesItem}>
              <div>{notice.message}</div>
              {notice.detail ? (
                <div style={styles.noticesItemDetail}>{notice.detail}</div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <button
        aria-expanded={expanded}
        aria-label={`${notices.length} scene ${
          notices.length === 1 ? "notice" : "notices"
        }`}
        onClick={() => setExpanded((current) => !current)}
        style={styles.noticesToggle}
        title={expanded ? "Hide scene notices" : "Show scene notices"}
        type="button"
      >
        <Icon
          name={IconName.Warning}
          size={Size.Xs}
          style={{
            ...styles.noticesIcon,
            color: NOTICE_SEVERITY_ICON_COLORS[worstNoticeSeverity(notices)],
          }}
        />
        {notices.length}
      </button>
    </div>
  );
}
