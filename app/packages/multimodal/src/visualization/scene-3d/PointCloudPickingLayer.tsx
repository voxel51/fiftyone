import { useThree } from "@react-three/fiber";
import {
  useContext,
  useEffect,
  useRef,
  type ContextType,
  type MutableRefObject,
} from "react";
import * as THREE from "three";

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
  pointPickWorldThreshold,
  resolvePointPick,
  sourcePointIndexForLayerRenderedIndex,
} from "./point-picking";
import { gpuPointCloudColorAtSample } from "./gpu/gpu-point-cloud-color";
import {
  resolveGpuPointCloudRenderedHover,
  sourcePointIndexForGpuSample,
  type GpuPointCloudHoverData,
} from "./gpu/gpu-point-cloud-hover";
import { useScenePicking } from "./scene-interactivity";
import type { PointCloudPanelLayer } from "./types";
import { useGraphicsRuntime } from "../webgpu/graphics-runtime-context";

/** Decoder metadata used to resolve one GPU-named sample in O(1). */
export interface GpuPointCloudPickData extends GpuPointCloudHoverData {
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
  const { backend } = useGraphicsRuntime();
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

    if (backend === "webgl2") {
      return attachWebGlPointPicking({
        camera: camera as unknown as THREE.Camera,
        element,
        gpuPickDataRef,
        layersRef,
        maxRenderedPointsRef,
        pointSizeRef,
        raycaster: raycaster as unknown as THREE.Raycaster,
        registry,
        scene: scene as unknown as THREE.Scene,
      });
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
  }, [active, backend, camera, gl, raycaster, registry, scene]);

  return null;
}

function attachWebGlPointPicking({
  camera,
  element,
  gpuPickDataRef,
  layersRef,
  maxRenderedPointsRef,
  pointSizeRef,
  raycaster,
  registry,
  scene,
}: {
  readonly camera: THREE.Camera;
  readonly element: HTMLCanvasElement;
  readonly gpuPickDataRef: MutableRefObject<
    ReadonlyMap<string, GpuPointCloudPickData>
  >;
  readonly layersRef: MutableRefObject<readonly PointCloudPanelLayer[]>;
  readonly maxRenderedPointsRef: MutableRefObject<number>;
  readonly pointSizeRef: MutableRefObject<number>;
  readonly raycaster: THREE.Raycaster;
  readonly registry: NonNullable<
    ContextType<typeof GpuPointCloud3dPickerRegistryContext>
  >;
  readonly scene: THREE.Scene;
}): () => void {
  let hoveredLayerId: string | null = null;
  let clearHoveredPoint: (() => void) | null = null;

  const clearHover = () => {
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
    const pointerX = clientX - rect.left;
    const pointerY = clientY - rect.top;
    const pointerNdc = new THREE.Vector2(
      (pointerX / rect.width) * 2 - 1,
      -((pointerY / rect.height) * 2 - 1),
    );
    raycaster.setFromCamera(pointerNdc, camera);

    const pickLayers = registry.snapshot();
    const pickObjects = pickLayers.map((layer) => layer.object);
    const pickRadiusPx = Math.max(POINT_PICK_RADIUS_PX, pointSizeRef.current);
    const previousThreshold = raycaster.params.Points?.threshold;
    raycaster.params.Points = {
      ...raycaster.params.Points,
      threshold: pointPickWorldThreshold({
        camera,
        pickRadiusPx,
        referenceDistance: farthestPointLayerDistance(camera, pickObjects),
        viewportHeightPx: rect.height,
      }),
    };
    let intersections: THREE.Intersection[];
    try {
      intersections = raycaster.intersectObjects(
        [...collectPointPickBlockingRoots(scene), ...pickObjects],
        true,
      );
    } finally {
      if (previousThreshold === undefined) {
        Reflect.deleteProperty(raycaster.params.Points, "threshold");
      } else {
        raycaster.params.Points.threshold = previousThreshold;
      }
    }

    const projected = new THREE.Vector3();
    const pick = resolvePointPick(
      intersections,
      (worldPoint) => {
        projected.copy(worldPoint).project(camera);
        const screenX = ((projected.x + 1) / 2) * rect.width;
        const screenY = ((1 - projected.y) / 2) * rect.height;
        return Math.hypot(screenX - pointerX, screenY - pointerY);
      },
      pickRadiusPx,
    );
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
    const gpu = gpuPickDataRef.current.get(pick.layerId);
    const livePickLayer = pickLayers.find(
      (candidate) => candidate.layerId === pick.layerId,
    );
    if (gpu && livePickLayer?.resourceKey !== gpu.resourceKey) {
      clearHover();
      return;
    }
    const gpuHover = gpu
      ? resolveGpuPointCloudRenderedHover(layer, gpu, pick.renderedIndex)
      : null;
    const pointIndex = gpu
      ? (gpuHover?.pointIndex ?? null)
      : sourcePointIndexForLayerRenderedIndex(
          layer,
          maxRenderedPointsRef.current,
          pick.renderedIndex,
        );
    if (pointIndex === null) {
      clearHover();
      return;
    }
    const color = gpu ? (gpuHover?.color ?? null) : pick.color;

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
      ...(gpuHover ? { sampleIndex: gpuHover.sampleIndex } : {}),
      worldPosition: pick.worldPosition,
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
    clearHover();
  };
}

function farthestPointLayerDistance(
  camera: THREE.Camera,
  objects: readonly THREE.Object3D[],
): number {
  camera.updateWorldMatrix(true, false);
  const cameraPosition = new THREE.Vector3().setFromMatrixPosition(
    camera.matrixWorld,
  );
  const center = new THREE.Vector3();
  let farthest = 0;
  for (const object of objects) {
    object.updateWorldMatrix(true, false);
    const points = object as THREE.Points;
    if (!points.geometry?.boundingSphere) {
      points.geometry?.computeBoundingSphere();
    }
    const sphere = points.geometry?.boundingSphere;
    if (!sphere) continue;
    center.copy(sphere.center).applyMatrix4(object.matrixWorld);
    farthest = Math.max(
      farthest,
      cameraPosition.distanceTo(center) +
        sphere.radius * object.matrixWorld.getMaxScaleOnAxis(),
    );
  }
  return farthest;
}
