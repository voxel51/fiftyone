import { Icon, IconName, Size } from "@voxel51/voodo";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as THREE from "three";

import MeasureRulerIcon from "../../../components/MeasureRulerIcon";
import type { PointCloudBounds } from "../../../decoders";
import { Base3DScene } from "../base-3d-scene";
import { WebGpuCanvas } from "../gpu/webgpu-canvas";
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
  EMPTY_POINT_CLOUD_BOUNDS_SIZE,
  buildPointCloudRenderData,
  type PointCloudColorOptions,
} from "./point-cloud-colors";
import { resolveGpuPointCloudColor } from "./gpu/gpu-point-cloud-color";
import {
  createGpuPointCloud3dPickerRegistry,
  GpuPointCloud3dPickerRegistryContext,
} from "./gpu/gpu-point-cloud-3d-picker";
import { gpuPointCloudDrawCount } from "./gpu/gpu-point-cloud-sampling";
import {
  DEFAULT_POINT_SIZE,
  PointCloudSceneLayer,
  type GpuPointCloudSceneData,
} from "./PointCloudSceneLayer";
import {
  PointCloudPickingLayer,
  type GpuPointCloudPickData,
} from "./PointCloudPickingLayer";
import { MeasurementLayer } from "./MeasurementLayer";
import {
  formatMeasurementDistance,
  measurementDistance,
  nextMeasurementState,
  type MeasurementPoint,
  type MeasurementState,
} from "./measurement";
import { SceneAnnotationLayer } from "./SceneAnnotationLayer";
import { ScenePickingContext } from "./scene-interactivity";
import { WorldGridLayer } from "./WorldGridLayer";
import { colormapCssGradient, pointCloudColormapKey } from "./colormaps";
import type {
  PanelNotice,
  PanelNoticeSeverity,
  PointCloudCameraPose,
  PointCloudColorRamp,
  PointCloudPanelLayer,
  PointCloudPanelProps,
  PointCloudRenderData,
} from "./types";
import { EMPTY_NOTICES, annotationPrimitiveSummaryForLayers } from "./utils";

const EMPTY_GPU_RENDER_ARRAY = new Float32Array(0);

interface PreparedPointCloudPanelLayer {
  readonly data: PointCloudRenderData;
  readonly gpu?: GpuPointCloudSceneData;
  readonly layer: PointCloudPanelLayer;
}

/**
 * Production point-cloud visualization panel backed by a stable Three.js
 * canvas. All layers share one scene and one camera, so multiple sensor
 * streams compose into a single fused view.
 */
export function PointCloudPanel({
  annotationLayers = [],
  background,
  cameraPose,
  canvasSurface,
  className,
  colorBy,
  fit = "initial",
  fitResetKey,
  frustumLayers = [],
  gridLayers = [],
  hudLines = [],
  layers,
  maxRenderedPoints = DEFAULT_MAX_RENDERED_POINTS,
  notices = EMPTY_NOTICES,
  onCameraPoseChange,
  onRenderStats,
  pointSize = DEFAULT_POINT_SIZE,
  sceneUp = "z",
  showGizmo = true,
  showColorLegend = false,
  showControls = true,
  showHud = true,
  style,
  worldGrid = null,
}: PointCloudPanelProps) {
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const pointPickerRegistry = useMemo(
    () => createGpuPointCloud3dPickerRegistry(),
    [],
  );
  const renderLayers = useMemo(
    () =>
      layers.map((layer): PreparedPointCloudPanelLayer => {
        const colorOptions = pointCloudColorOptions(layer, colorBy);
        const payload = layer.frame.renderPayload;
        if (!payload) {
          return {
            data: buildPointCloudRenderData(
              layer.frame.positions,
              maxRenderedPoints,
              colorOptions,
            ),
            layer,
          };
        }

        const gpuColor = resolveGpuPointCloudColor(payload, colorOptions);
        const renderedPointCount = gpuPointCloudDrawCount(
          payload.sampledPointCount,
          maxRenderedPoints,
        );
        return {
          // Scene fitting, legends, and render stats consume this compact
          // summary. The 3D layer reads typed arrays only from `gpu.payload`.
          data: {
            bounds: pointCloudPayloadBounds(payload.bounds),
            colorRamp: gpuColor.colorRamp,
            colors: EMPTY_GPU_RENDER_ARRAY,
            finitePointCount: payload.finitePointCount,
            positions: EMPTY_GPU_RENDER_ARRAY,
            renderedPointCount,
          },
          gpu: {
            color: gpuColor,
            payload,
            renderedPointCount,
            ...(layer.contentTimeNs === undefined
              ? {}
              : {
                  resourceKey: `${layer.id}\n${layer.contentTimeNs.toString()}`,
                }),
          },
          layer,
        };
      }),
    [colorBy, layers, maxRenderedPoints],
  );
  const gpuPickData = useMemo(() => {
    const byLayerId = new Map<string, GpuPointCloudPickData>();
    for (const { gpu, layer } of renderLayers) {
      if (gpu) {
        byLayerId.set(layer.id, {
          color: gpu.color,
          payload: gpu.payload,
          renderedPointCount: gpu.renderedPointCount,
          resourceKey: gpu.resourceKey ?? layer.id,
        });
      }
    }
    return byLayerId;
  }, [renderLayers]);
  // Legend entries for every distinct active ramp. Ramp bounds churn with
  // playback (per-frame min/max), so identity is the rendered content key —
  // two sensors sharing a field/colormap/range collapse into one entry.
  const colorRamps = useMemo(() => {
    const seen = new Set<string>();
    const ramps: PointCloudColorRamp[] = [];
    for (const { data } of renderLayers) {
      const ramp = data.colorRamp;
      if (!ramp) continue;
      const key = colorRampKey(ramp);
      if (seen.has(key)) continue;
      seen.add(key);
      ramps.push(ramp);
    }
    return ramps;
  }, [renderLayers]);

  const frameFitPose = useMemo(
    () =>
      cameraPoseForBounds(
        sceneBoundsForLayers(renderLayers, annotationLayers, gridLayers),
      ),
    [annotationLayers, gridLayers, renderLayers],
  );
  const [initialFitPose, setInitialFitPose] =
    useState<PointCloudCameraPose | null>(null);
  const [appliedFitResetKey, setAppliedFitResetKey] = useState(fitResetKey);
  if (appliedFitResetKey !== fitResetKey) {
    // Render-time state adjustment (not an effect): the re-placed layers and
    // the new fit key arrive in the same render, so the stale initial fit
    // must be discarded before this frame's fit fallback is computed.
    setAppliedFitResetKey(fitResetKey);
    setInitialFitPose(null);
  }

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
  const effectiveWorldGrid = useMemo(
    () => (worldGrid ? { ...worldGrid, up: worldGrid.up ?? sceneUp } : null),
    [sceneUp, worldGrid],
  );
  const handleRecenter = () => {
    if (!frameFitPose) {
      return;
    }
    // Recentering routes through the controlled-pose channel when a caller
    // owns the camera (source "focus" counts as a deliberate change, so
    // follow modes re-base their anchor onto the fitted view); the local
    // initial-fit capture covers uncontrolled panels.
    setInitialFitPose(frameFitPose);
    onCameraPoseChange?.(frameFitPose, "focus");
  };
  const cameraPoseSource = cameraPose
    ? "controlled"
    : fittedCameraPose
      ? "fitted"
      : "none";

  // Two-click grid-plane ruler. Armed mode suspends scene picking
  // (annotation/frustum clicks) so a ruler click can't double as a select;
  // orbiting stays live either way.
  const [measureArmed, setMeasureArmed] = useState(false);
  const [measurement, setMeasurement] = useState<MeasurementState | null>(null);
  const measurePlaneUp = effectiveWorldGrid?.up ?? sceneUp;
  const handleMeasureToggle = () => {
    if (measureArmed) setMeasurement(null);
    setMeasureArmed(!measureArmed);
  };
  const handleMeasurePick = useCallback((point: MeasurementPoint) => {
    setMeasurement((current) => nextMeasurementState(current, point));
  }, []);
  // This effect makes Escape peel the tool back one step while armed:
  // first the current measurement, then the mode itself.
  useEffect(() => {
    if (!measureArmed) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (measurement) {
        setMeasurement(null);
      } else {
        setMeasureArmed(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [measureArmed, measurement]);
  useEffect(() => {
    setMeasurement(null);
  }, [measurePlaneUp]);
  const measuredDistance = measurementDistance(measurement, measurePlaneUp);
  const measureReadout = !measureArmed
    ? null
    : measuredDistance !== null
      ? formatMeasurementDistance(measuredDistance)
      : measurement
        ? "Pick the second grid point"
        : "Pick two grid points";

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
        style={
          measureArmed
            ? { ...styles.canvas, cursor: "crosshair" }
            : styles.canvas
        }
        surface={canvasSurface}
      >
        <Base3DScene
          background={background}
          cameraPose={effectiveCameraPose}
          onCameraPoseChange={onCameraPoseChange}
          showGizmo={showGizmo}
          up={sceneUp}
        >
          <ScenePickingContext.Provider value={!measureArmed}>
            <GpuPointCloud3dPickerRegistryContext.Provider
              value={pointPickerRegistry}
            >
              {effectiveWorldGrid ? (
                <WorldGridLayer {...effectiveWorldGrid} />
              ) : null}
              {gridLayers.map((layer, index) => (
                <GridSceneLayer
                  key={layer.id}
                  layer={layer}
                  renderOrder={index - gridLayers.length}
                />
              ))}
              {renderLayers.map(({ data, gpu, layer }) => (
                <PointCloudSceneLayer
                  key={layer.id}
                  data={data}
                  gpu={gpu}
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
              <PointCloudPickingLayer
                gpuPickData={gpuPickData}
                layers={layers}
                maxRenderedPoints={maxRenderedPoints}
                pointSize={pointSize}
              />
              <MeasurementLayer
                armed={measureArmed}
                measurement={measurement}
                onPick={handleMeasurePick}
                planeUp={measurePlaneUp}
              />
            </GpuPointCloud3dPickerRegistryContext.Provider>
          </ScenePickingContext.Provider>
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
      {!canvasError && showColorLegend && colorRamps.length > 0 ? (
        <ColorRampLegend ramps={colorRamps} />
      ) : null}
      {showControls && !canvasError && frameFitPose ? (
        <button
          aria-label="Recenter view"
          onClick={handleRecenter}
          style={styles.recenter}
          title="Recenter the view on the current scene"
          type="button"
        >
          <Icon
            name={IconName.Fullscreen}
            size={Size.Xs}
            style={styles.noticesIcon}
          />
        </button>
      ) : null}
      {showControls && !canvasError && frameFitPose ? (
        <button
          aria-label="Measure distance"
          aria-pressed={measureArmed}
          onClick={handleMeasureToggle}
          style={
            measureArmed ? styles.measureToggleActive : styles.measureToggle
          }
          title="Measure distance on the grid plane (Esc clears)"
          type="button"
        >
          <MeasureRulerIcon />
        </button>
      ) : null}
      {showControls && !canvasError && measureReadout ? (
        <div data-testid="measure-readout" style={styles.measureReadout}>
          {measureReadout}
        </div>
      ) : null}
      <PanelNotices notices={notices} />
    </div>
  );
}

function pointCloudColorOptions(
  layer: PointCloudPanelLayer,
  colorBy: PointCloudPanelProps["colorBy"],
): PointCloudColorOptions {
  return {
    colorBy: layer.colorSettings?.colorBy ?? colorBy,
    colormap: layer.colorSettings?.colormap,
    colors: layer.frame.colors,
    rangeMax: layer.colorSettings?.rangeMax,
    rangeMin: layer.colorSettings?.rangeMin,
    scalarFields: layer.frame.scalarFields,
    uniformColor: layer.colorSettings?.uniformColor,
  };
}

function pointCloudPayloadBounds(bounds: PointCloudBounds | null): THREE.Box3 {
  if (bounds) {
    return new THREE.Box3(
      new THREE.Vector3(...bounds.min),
      new THREE.Vector3(...bounds.max),
    );
  }
  return new THREE.Box3().setFromCenterAndSize(
    new THREE.Vector3(),
    new THREE.Vector3(
      EMPTY_POINT_CLOUD_BOUNDS_SIZE,
      EMPTY_POINT_CLOUD_BOUNDS_SIZE,
      EMPTY_POINT_CLOUD_BOUNDS_SIZE,
    ),
  );
}

function colorRampKey(ramp: PointCloudColorRamp): string {
  return [
    ramp.fieldLabel,
    pointCloudColormapKey(ramp.colormap),
    formatColorRampValue(ramp.minValue),
    formatColorRampValue(ramp.maxValue),
  ].join("|");
}

/** Compact ramp-bound readout: three significant digits, no exponent noise. */
function formatColorRampValue(value: number): string {
  if (!Number.isFinite(value)) {
    return "–";
  }
  if (Math.abs(value) >= 1000) {
    return Math.round(value).toString();
  }
  return Number(value.toPrecision(3)).toString();
}

/**
 * Corner chip mapping each active scalar ramp (field → colormap gradient →
 * value range) so ramp colors are readable as data, not decoration.
 */
function ColorRampLegend({
  ramps,
}: {
  readonly ramps: readonly PointCloudColorRamp[];
}) {
  return (
    <div
      aria-label="Point cloud color legend"
      data-testid="point-cloud-color-legend"
      style={styles.legend}
    >
      {ramps.map((ramp) => (
        <div key={colorRampKey(ramp)} style={styles.legendEntry}>
          <div style={styles.legendLabel}>{ramp.fieldLabel}</div>
          <div
            style={{
              ...styles.legendBar,
              background: colormapCssGradient(ramp.colormap),
            }}
          />
          <div style={styles.legendRange}>
            <span>{formatColorRampValue(ramp.minValue)}</span>
            <span>{formatColorRampValue(ramp.maxValue)}</span>
          </div>
        </div>
      ))}
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
