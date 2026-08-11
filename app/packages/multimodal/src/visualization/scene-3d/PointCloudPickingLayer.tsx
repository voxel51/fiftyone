import { useThree } from "@react-three/fiber";
import { useContext, useEffect, useRef } from "react";
import * as THREE from "three";

import type { PointCloudRenderPayload } from "../../ir";
import {
  POINT_HOVER_DWELL_MS,
  POINT_HOVER_MOVE_TOLERANCE_PX,
} from "../interaction/hover-inspect";
import { attachPointerDwell } from "../interaction/pointer-dwell";
import {
  createGpuPointCloud3dPickerController,
  GpuPointCloud3dPickerRegistryContext,
} from "./gpu/gpu-point-cloud-3d-picker";
import {
  POINT_PICK_RADIUS_PX,
  collectPointPickBlockingRoots,
  sourcePointIndexForLayerRenderedIndex,
} from "./point-picking";
import {
  gpuPointCloudColorAtSample,
  type ResolvedGpuPointCloudColor,
} from "./gpu/gpu-point-cloud-color";
import { useScenePicking } from "./scene-interactivity";
import type { PointCloudPanelLayer } from "./types";

/** Decoder metadata used to resolve one GPU-named sample in O(1). */
export interface GpuPointCloudPickData {
  readonly color: ResolvedGpuPointCloudColor;
  readonly payload: PointCloudRenderPayload;
  readonly renderedPointCount: number;
  readonly resourceKey: string;
}

const EMPTY_GPU_PICK_DATA: ReadonlyMap<string, GpuPointCloudPickData> =
  new Map();

/**
 * Dwell-time point inspection. A 1x1 integer WebGPU pass selects the nearest
 * point across every registered cloud, sharing the visible flat-storage
 * buffers and exact LOD index expression. The only CPU raycast is against
 * tagged annotation/frustum roots so their interaction precedence remains
 * unchanged without scanning point vertices.
 */
export function PointCloudPickingLayer({
  gpuPickData = EMPTY_GPU_PICK_DATA,
  layers,
  maxRenderedPoints,
  pointSize,
}: {
  readonly gpuPickData?: ReadonlyMap<string, GpuPointCloudPickData>;
  readonly layers: readonly PointCloudPanelLayer[];
  readonly maxRenderedPoints: number;
  readonly pointSize: number;
}) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const raycaster = useThree((state) => state.raycaster);
  const scene = useThree((state) => state.scene);
  const registry = useContext(GpuPointCloud3dPickerRegistryContext);
  const pickingEnabled = useScenePicking();
  const active = pickingEnabled && layers.some((layer) => layer.onHoverPoint);

  // Pointer listeners and GPU state are stable for the active session; only
  // the current callbacks and frame metadata flow through these refs.
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const pointSizeRef = useRef(pointSize);
  pointSizeRef.current = pointSize;
  const maxRenderedPointsRef = useRef(maxRenderedPoints);
  maxRenderedPointsRef.current = maxRenderedPoints;
  const gpuPickDataRef = useRef(gpuPickData);
  gpuPickDataRef.current = gpuPickData;

  useEffect(() => {
    const element = gl?.domElement as HTMLCanvasElement | undefined;
    if (!active || !element || !camera || !raycaster || !registry || !scene) {
      return undefined;
    }

    // The controller owns GPU objects; React owns only its lifetime. Rendered
    // point layers register their live storage attributes through context so
    // this interaction layer never reaches into sibling component refs.
    const controller = createGpuPointCloud3dPickerController(gl);
    const syncScene = () => controller.setScene(registry.snapshot());
    const unsubscribeRegistry = registry.subscribe(syncScene);
    syncScene();

    let hoveredLayerId: string | null = null;
    let clearHoveredPoint: (() => void) | null = null;
    let requestGeneration = 0;

    const clearHover = () => {
      // Invalidate both promise layers: the local token protects callbacks in
      // this effect, while the controller token protects its readback decode.
      requestGeneration += 1;
      controller.invalidate();
      const clear = clearHoveredPoint;
      hoveredLayerId = null;
      clearHoveredPoint = null;
      clear?.();
    };

    const pickAt = (clientX: number, clientY: number) => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        clearHover();
        return;
      }

      // Fiber and the Three runtime have distinct declaration
      // identities even though these are the same runtime objects.
      const threeCamera = camera as unknown as THREE.Camera;
      const threeRaycaster = raycaster as unknown as THREE.Raycaster;
      const threeScene = scene as unknown as THREE.Scene;
      const pointerX = clientX - rect.left;
      const pointerY = clientY - rect.top;
      const pointerNdc = new THREE.Vector2(
        (pointerX / rect.width) * 2 - 1,
        -((pointerY / rect.height) * 2 - 1),
      );
      threeRaycaster.setFromCamera(pointerNdc, threeCamera);

      // Keep CPU raycasting only for sparse semantic objects that must win over
      // points (annotations/frustums). Raycasting millions of cloud vertices
      // is the O(N) path this GPU picker replaces.
      const blockers = collectPointPickBlockingRoots(threeScene);
      if (
        blockers.length > 0 &&
        threeRaycaster.intersectObjects(blockers, true).length > 0
      ) {
        clearHover();
        return;
      }

      const pickRadiusPx = Math.max(POINT_PICK_RADIUS_PX, pointSizeRef.current);
      const generation = ++requestGeneration;
      void controller
        .pick({
          camera: threeCamera,
          far: threeRaycaster.far,
          near: threeRaycaster.near,
          pointerNdc,
          radiusPx: pickRadiusPx,
          rayDirection: threeRaycaster.ray.direction,
          rayOrigin: threeRaycaster.ray.origin,
          raycasterLayers: threeRaycaster.layers,
          viewportHeightPx: rect.height,
          viewportWidthPx: rect.width,
        })
        .then((pick) => {
          if (generation !== requestGeneration) {
            return;
          }
          if (!pick) {
            clearHover();
            return;
          }

          const layer = layersRef.current.find(
            (candidate) => candidate.id === pick.layerId,
          );
          if (!layer?.onHoverPoint) {
            clearHover();
            return;
          }

          // A GPU hit identifies a canonical sampled point. Convert that into
          // the decoded frame's source index before publishing the hover API;
          // layers without source indices use their rendered-index map.
          const gpu = gpuPickDataRef.current.get(pick.layerId);
          let pointIndex: number | null;
          let color: readonly [number, number, number] | null;
          if (gpu) {
            // Playback may advance between command submission and mapAsync.
            // Never interpret an old sample index against the new frame.
            if (gpu.resourceKey !== pick.resourceKey) {
              clearHover();
              return;
            }
            pointIndex = sourcePointIndexForGpuSample(
              layer,
              gpu.payload,
              pick.sampleIndex,
            );
            color = gpuPointCloudColorAtSample(
              gpu.color,
              gpu.payload,
              pick.sampleIndex,
            );
          } else {
            pointIndex = sourcePointIndexForLayerRenderedIndex(
              layer,
              maxRenderedPointsRef.current,
              pick.sampleIndex,
            );
            color = pick.color;
          }
          if (pointIndex === null) {
            clearHover();
            return;
          }

          if (hoveredLayerId !== null && hoveredLayerId !== pick.layerId) {
            const clear = clearHoveredPoint;
            clearHoveredPoint = null;
            clear?.();
          }
          hoveredLayerId = pick.layerId;
          clearHoveredPoint = () => layer.onHoverPoint?.(null);
          layer.onHoverPoint({
            color,
            pointIndex,
            ...(gpu ? { sampleIndex: pick.sampleIndex } : {}),
            worldPosition: pick.worldPosition,
          });
        })
        .catch(() => {
          if (generation === requestGeneration) {
            clearHover();
          }
        });
    };

    const detachDwell = attachPointerDwell(element, {
      dwellMs: POINT_HOVER_DWELL_MS,
      moveTolerancePx: POINT_HOVER_MOVE_TOLERANCE_PX,
      onCancel: clearHover,
      onDwell: pickAt,
    });

    return () => {
      detachDwell();
      unsubscribeRegistry();
      clearHover();
      controller.dispose();
    };
  }, [active, camera, gl, raycaster, registry, scene]);

  return null;
}

function sourcePointIndexForGpuSample(
  layer: PointCloudPanelLayer,
  payload: PointCloudRenderPayload,
  sampleIndex: number,
): number | null {
  if (
    !Number.isInteger(sampleIndex) ||
    sampleIndex < 0 ||
    sampleIndex >= payload.sampledPointCount ||
    sampleIndex >= payload.sourceIndices.length
  ) {
    return null;
  }
  // sourceIndices is the worker-built identity bridge from the bounded GPU
  // sample back to its packed source record.
  const sourceIndex = payload.sourceIndices[sampleIndex];
  const sourcePointCount = payload.sourcePointCount ?? layer.frame.pointCount;
  return sourceIndex < sourcePointCount ? sourceIndex : null;
}
