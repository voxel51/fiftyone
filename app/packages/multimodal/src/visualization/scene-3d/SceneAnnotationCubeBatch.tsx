/* eslint-disable react/no-unknown-property */
import { type ThreeEvent, useThree } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import * as THREE from "three";
import * as TSL from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";

import type { SceneCubePrimitive, SceneEntityVisualization } from "../../ir";
import { CLICK_DRAG_TOLERANCE_PX } from "../interaction/interaction";
import { POINT_PICK_BLOCKING_USER_DATA } from "./point-picking";
import { useScenePicking } from "./scene-interactivity";
import type { SceneAnnotationPanelLayer } from "./types";
import {
  DEFAULT_SCENE_CUBE_COLOR,
  SCENE_SELECTED_DASH_SIZE,
  SCENE_SELECTED_GAP_SIZE,
  clamp01,
  isFinitePositiveVector,
} from "./utils";

const CUBE_COLOR_ATTRIBUTE = "sceneCubeColor";
const CUBE_OPACITY_ATTRIBUTE = "sceneCubeOpacity";
const CUBE_COMPONENT_COUNT = 3;
const CUBE_MATRIX_COMPONENT_COUNT = 16;
const CUBE_WIREFRAME_MAX_OPACITY = 0.95;
const CUBE_MIN_OPACITY = 0.2;
const SELECTED_BOX_EDGE_COUNT = 12;
const SELECTED_BOX_VERTEX_COUNT = SELECTED_BOX_EDGE_COUNT * 2;
const SELECTED_BOX_POSITION_COMPONENT_COUNT =
  SELECTED_BOX_VERTEX_COUNT * CUBE_COMPONENT_COUNT;

const UNIT_BOX_CORNERS = [
  [-0.5, -0.5, -0.5],
  [0.5, -0.5, -0.5],
  [0.5, 0.5, -0.5],
  [-0.5, 0.5, -0.5],
  [-0.5, -0.5, 0.5],
  [0.5, -0.5, 0.5],
  [0.5, 0.5, 0.5],
  [-0.5, 0.5, 0.5],
] as const;

const UNIT_BOX_EDGES = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
] as const;

type CubePointerEvent = ThreeEvent<MouseEvent> | ThreeEvent<PointerEvent>;

/** One cube plus the entity/layer interaction contract owning it. */
export interface SceneCubeBatchRecord {
  readonly cube: SceneCubePrimitive;
  readonly entityId: string;
  readonly key: string;
  readonly layer: SceneAnnotationPanelLayer;
}

/** Render partition for normal/selected and interactive/passive cube batches. */
export interface SceneAnnotationCubeRenderPlan {
  readonly normalInteractive: readonly SceneCubeBatchRecord[];
  readonly normalPassive: readonly SceneCubeBatchRecord[];
  readonly residualLayers: readonly SceneAnnotationPanelLayer[];
  readonly selectedInteractive: readonly SceneCubeBatchRecord[];
  readonly selectedPassive: readonly SceneCubeBatchRecord[];
}

/** Persistent geometry, material, and attributes for one normal cube batch. */
export interface SceneCubeBatchResource {
  readonly colorAttribute: THREE.InstancedBufferAttribute;
  readonly geometry: THREE.BoxGeometry;
  readonly material: MeshBasicNodeMaterial;
  readonly mesh: THREE.InstancedMesh;
  readonly opacityAttribute: THREE.InstancedBufferAttribute;
}

/** Persistent geometry and material for one selected dashed-edge batch. */
export interface SelectedSceneCubeBatchResource {
  readonly geometry: THREE.BufferGeometry;
  readonly lineDistances: THREE.BufferAttribute;
  readonly lines: THREE.LineSegments;
  readonly material: THREE.LineDashedMaterial;
  readonly positions: THREE.BufferAttribute;
}

interface HoveredCubeRecord {
  readonly index: number;
  readonly key: string;
  readonly record: SceneCubeBatchRecord;
}

interface CubeBatchInteraction {
  readonly commitRecords: (
    records: readonly SceneCubeBatchRecord[],
  ) => string | null;
  readonly enabled: boolean;
  readonly onClick: (event: ThreeEvent<MouseEvent>) => void;
  readonly onPointerMove: (event: ThreeEvent<PointerEvent>) => void;
  readonly onPointerOut: (event: ThreeEvent<PointerEvent>) => void;
  readonly onPointerOver: (event: ThreeEvent<PointerEvent>) => void;
}

const EMPTY_CUBE_RENDER_PLAN: SceneAnnotationCubeRenderPlan = {
  normalInteractive: [],
  normalPassive: [],
  residualLayers: [],
  selectedInteractive: [],
  selectedPassive: [],
};

/**
 * Partitions annotation layers once so cubes take the batched path while
 * every other primitive family keeps the existing entity renderer.
 */
export function buildSceneAnnotationCubeRenderPlan(
  layers: readonly SceneAnnotationPanelLayer[],
): SceneAnnotationCubeRenderPlan {
  if (layers.length === 0) {
    return EMPTY_CUBE_RENDER_PLAN;
  }

  const normalInteractive: SceneCubeBatchRecord[] = [];
  const normalPassive: SceneCubeBatchRecord[] = [];
  const residualLayers: SceneAnnotationPanelLayer[] = [];
  const selectedInteractive: SceneCubeBatchRecord[] = [];
  const selectedPassive: SceneCubeBatchRecord[] = [];

  for (const layer of layers) {
    let hasResidualPrimitives = false;
    const interactive = Boolean(layer.onHoverEntity || layer.onSelectEntity);
    const selected = Boolean(layer.highlighted);
    const target = selected
      ? interactive
        ? selectedInteractive
        : selectedPassive
      : interactive
        ? normalInteractive
        : normalPassive;

    for (
      let entityIndex = 0;
      entityIndex < layer.frame.entities.length;
      entityIndex++
    ) {
      const entity = layer.frame.entities[entityIndex];
      hasResidualPrimitives ||= sceneEntityHasNonCubePrimitives(entity);
      const entityId = entity.id || String(entityIndex);
      for (
        let primitiveIndex = 0;
        primitiveIndex < entity.cubes.length;
        primitiveIndex++
      ) {
        const cube = entity.cubes[primitiveIndex];
        if (!isFinitePositiveVector(cube.size)) {
          continue;
        }
        target.push({
          cube,
          entityId,
          key: `${layer.id}:${entityId}:cube:${primitiveIndex}`,
          layer,
        });
      }
    }

    if (hasResidualPrimitives) {
      residualLayers.push(layer);
    }
  }

  return {
    normalInteractive,
    normalPassive,
    residualLayers,
    selectedInteractive,
    selectedPassive,
  };
}

/**
 * Renders all eligible annotation cubes in a bounded number of scene objects:
 * at most one normal and one selected batch per interaction class.
 */
export function SceneAnnotationCubeBatches({
  plan,
}: {
  readonly plan: SceneAnnotationCubeRenderPlan;
}) {
  return (
    <>
      {plan.normalInteractive.length > 0 ? (
        <SceneCubeBatch interactive records={plan.normalInteractive} />
      ) : null}
      {plan.normalPassive.length > 0 ? (
        <SceneCubeBatch records={plan.normalPassive} />
      ) : null}
      {plan.selectedInteractive.length > 0 ? (
        <SelectedSceneCubeBatch
          interactive
          records={plan.selectedInteractive}
        />
      ) : null}
      {plan.selectedPassive.length > 0 ? (
        <SelectedSceneCubeBatch records={plan.selectedPassive} />
      ) : null}
    </>
  );
}

function SceneCubeBatch({
  interactive = false,
  records,
}: {
  readonly interactive?: boolean;
  readonly records: readonly SceneCubeBatchRecord[];
}) {
  const invalidate = useThree((state) => state.invalidate);
  const capacity = useGrowingInstanceCapacity(records.length);
  const resource = useMemo(
    () => createSceneCubeBatchResource(capacity),
    [capacity],
  );
  const interaction = useCubeBatchInteraction({
    enabled: interactive,
    object: resource.mesh,
    onHoverChange: (previous, next) => {
      updateNormalCubeHover(resource, previous, next);
      invalidate();
    },
    resolveIndex: normalCubeIndexForEvent,
  });

  // This layout effect uploads the current frame before the canvas paints.
  useLayoutEffect(() => {
    const hoveredKey = interaction.commitRecords(records);
    applySceneCubeBatchRecords(resource, records, hoveredKey);
    invalidate();
  }, [interaction, invalidate, records, resource]);

  // This effect releases GPU resources when capacity grows or the batch exits.
  useEffect(
    () => () => {
      resource.mesh.dispose();
      resource.geometry.dispose();
      resource.material.dispose();
    },
    [resource],
  );

  if (records.length === 0) {
    return null;
  }

  return (
    <primitive
      object={resource.mesh}
      onClick={interaction.enabled ? interaction.onClick : undefined}
      onPointerMove={
        interaction.enabled ? interaction.onPointerMove : undefined
      }
      onPointerOut={interaction.enabled ? interaction.onPointerOut : undefined}
      onPointerOver={
        interaction.enabled ? interaction.onPointerOver : undefined
      }
    />
  );
}

function SelectedSceneCubeBatch({
  interactive = false,
  records,
}: {
  readonly interactive?: boolean;
  readonly records: readonly SceneCubeBatchRecord[];
}) {
  const invalidate = useThree((state) => state.invalidate);
  const capacity = useGrowingInstanceCapacity(records.length);
  const resource = useMemo(
    () => createSelectedSceneCubeBatchResource(capacity),
    [capacity],
  );
  const interaction = useCubeBatchInteraction({
    enabled: interactive,
    object: resource.lines,
    onHoverChange: () => invalidate(),
    resolveIndex: selectedCubeIndexForEvent,
  });

  // This layout effect uploads the selected edges before the canvas paints.
  useLayoutEffect(() => {
    interaction.commitRecords(records);
    applySelectedSceneCubeBatchRecords(resource, records);
    invalidate();
  }, [interaction, invalidate, records, resource]);

  // This effect releases GPU resources when capacity grows or the batch exits.
  useEffect(
    () => () => {
      resource.geometry.dispose();
      resource.material.dispose();
    },
    [resource],
  );

  if (records.length === 0) {
    return null;
  }

  return (
    <primitive
      object={resource.lines}
      onClick={interaction.enabled ? interaction.onClick : undefined}
      onPointerMove={
        interaction.enabled ? interaction.onPointerMove : undefined
      }
      onPointerOut={interaction.enabled ? interaction.onPointerOut : undefined}
      onPointerOver={
        interaction.enabled ? interaction.onPointerOver : undefined
      }
    />
  );
}

/**
 * Allocates one grow-only-capacity InstancedMesh. Capacity changes replace the
 * whole resource; ordinary playback mutates its arrays in place.
 */
export function createSceneCubeBatchResource(
  capacity: number,
): SceneCubeBatchResource {
  const boundedCapacity = Math.max(1, Math.floor(capacity));
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const colorAttribute = new THREE.InstancedBufferAttribute(
    new Float32Array(boundedCapacity * CUBE_COMPONENT_COUNT),
    CUBE_COMPONENT_COUNT,
  );
  const opacityAttribute = new THREE.InstancedBufferAttribute(
    new Float32Array(boundedCapacity),
    1,
  );
  geometry.setAttribute(CUBE_COLOR_ATTRIBUTE, colorAttribute);
  geometry.setAttribute(CUBE_OPACITY_ATTRIBUTE, opacityAttribute);

  const material = new MeshBasicNodeMaterial();
  material.colorNode = TSL.instancedBufferAttribute(colorAttribute, "vec3");
  material.opacityNode = TSL.instancedBufferAttribute(
    opacityAttribute,
    "float",
  );
  material.transparent = true;
  material.wireframe = true;

  const mesh = new THREE.InstancedMesh(geometry, material, boundedCapacity);
  mesh.count = 0;
  mesh.frustumCulled = false;

  return {
    colorAttribute,
    geometry,
    material,
    mesh,
    opacityAttribute,
  };
}

/** Bulk-writes every normal box matrix and appearance into stable buffers. */
export function applySceneCubeBatchRecords(
  resource: SceneCubeBatchResource,
  records: readonly SceneCubeBatchRecord[],
  hoveredKey: string | null = null,
): void {
  const matrixArray = resource.mesh.instanceMatrix.array as Float32Array;
  const colorArray = resource.colorAttribute.array as Float32Array;
  const opacityArray = resource.opacityAttribute.array as Float32Array;
  const frameMatrix = new THREE.Matrix4();
  const cubeMatrix = new THREE.Matrix4();
  const worldMatrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  let previousLayer: SceneAnnotationPanelLayer | null = null;

  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (record.layer !== previousLayer) {
      composeFrameMatrix(record.layer, frameMatrix, quaternion);
      previousLayer = record.layer;
    }
    composeCubeMatrix(record.cube, cubeMatrix, quaternion, position, scale);
    worldMatrix.multiplyMatrices(frameMatrix, cubeMatrix);
    worldMatrix.toArray(matrixArray, index * CUBE_MATRIX_COMPONENT_COUNT);
    writeCubeAppearance(
      colorArray,
      opacityArray,
      index,
      record,
      record.key === hoveredKey,
    );
  }

  resource.mesh.count = records.length;
  // InstancedMesh caches aggregate bounds after its first raycast. Playback
  // rewrites matrices in place, so invalidate those caches or later hover
  // rays can reject boxes that moved outside the previous frame's bounds.
  resource.mesh.boundingBox = null;
  resource.mesh.boundingSphere = null;
  markAttributeUpdated(
    resource.mesh.instanceMatrix,
    records.length * CUBE_MATRIX_COMPONENT_COUNT,
  );
  markAttributeUpdated(
    resource.colorAttribute,
    records.length * CUBE_COMPONENT_COUNT,
  );
  markAttributeUpdated(resource.opacityAttribute, records.length);
}

/** Allocates one clean 12-edge LineSegments batch for selected cubes. */
export function createSelectedSceneCubeBatchResource(
  capacity: number,
): SelectedSceneCubeBatchResource {
  const boundedCapacity = Math.max(1, Math.floor(capacity));
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(
    new Float32Array(boundedCapacity * SELECTED_BOX_POSITION_COMPONENT_COUNT),
    CUBE_COMPONENT_COUNT,
  );
  const lineDistances = new THREE.BufferAttribute(
    new Float32Array(boundedCapacity * SELECTED_BOX_VERTEX_COUNT),
    1,
  );
  geometry.setAttribute("position", positions);
  geometry.setAttribute("lineDistance", lineDistances);
  geometry.setDrawRange(0, 0);

  const material = new THREE.LineDashedMaterial({
    color: 0xffffff,
    dashSize: SCENE_SELECTED_DASH_SIZE,
    gapSize: SCENE_SELECTED_GAP_SIZE,
    opacity: 1,
    transparent: true,
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;

  return { geometry, lineDistances, lines, material, positions };
}

/** Bulk-writes transformed selected-box edges into one line geometry. */
export function applySelectedSceneCubeBatchRecords(
  resource: SelectedSceneCubeBatchResource,
  records: readonly SceneCubeBatchRecord[],
): void {
  const positions = resource.positions.array as Float32Array;
  const lineDistances = resource.lineDistances.array as Float32Array;
  const frameMatrix = new THREE.Matrix4();
  const cubeMatrix = new THREE.Matrix4();
  const worldMatrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  let previousLayer: SceneAnnotationPanelLayer | null = null;

  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (record.layer !== previousLayer) {
      composeFrameMatrix(record.layer, frameMatrix, quaternion);
      previousLayer = record.layer;
    }
    composeCubeMatrix(record.cube, cubeMatrix, quaternion, position, scale);
    worldMatrix.multiplyMatrices(frameMatrix, cubeMatrix);

    let distance = 0;
    for (let edgeIndex = 0; edgeIndex < UNIT_BOX_EDGES.length; edgeIndex++) {
      const [startIndex, endIndex] = UNIT_BOX_EDGES[edgeIndex];
      start.fromArray(UNIT_BOX_CORNERS[startIndex]).applyMatrix4(worldMatrix);
      end.fromArray(UNIT_BOX_CORNERS[endIndex]).applyMatrix4(worldMatrix);
      const vertexOffset = index * SELECTED_BOX_VERTEX_COUNT + edgeIndex * 2;
      start.toArray(positions, vertexOffset * CUBE_COMPONENT_COUNT);
      end.toArray(positions, (vertexOffset + 1) * CUBE_COMPONENT_COUNT);
      lineDistances[vertexOffset] = distance;
      distance += start.distanceTo(end);
      lineDistances[vertexOffset + 1] = distance;
    }
  }

  const vertexCount = records.length * SELECTED_BOX_VERTEX_COUNT;
  resource.geometry.setDrawRange(0, vertexCount);
  resource.geometry.boundingBox = null;
  resource.geometry.boundingSphere = null;
  markAttributeUpdated(
    resource.positions,
    records.length * SELECTED_BOX_POSITION_COMPONENT_COUNT,
  );
  markAttributeUpdated(resource.lineDistances, vertexCount);
}

/**
 * Maintains transient per-instance hover and selection state without forcing
 * the cube batch through React renders on pointer movement.
 */
export function useCubeBatchInteraction({
  enabled: requestedEnabled,
  object,
  onHoverChange,
  resolveIndex,
}: {
  readonly enabled: boolean;
  readonly object: THREE.Object3D;
  readonly onHoverChange: (
    previous: HoveredCubeRecord | null,
    next: HoveredCubeRecord | null,
  ) => void;
  readonly resolveIndex: (event: CubePointerEvent) => number | null;
}): CubeBatchInteraction {
  const pickingEnabled = useScenePicking();
  const enabled = requestedEnabled && pickingEnabled;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const recordsRef = useRef<readonly SceneCubeBatchRecord[]>([]);
  const hoveredRef = useRef<HoveredCubeRecord | null>(null);
  const cursorRestoreRef = useRef<string | null>(null);
  const onHoverChangeRef = useRef(onHoverChange);
  onHoverChangeRef.current = onHoverChange;
  const resolveIndexRef = useRef(resolveIndex);
  resolveIndexRef.current = resolveIndex;

  const restoreCursor = useCallback(() => {
    if (cursorRestoreRef.current === null || typeof document === "undefined") {
      return;
    }
    document.body.style.cursor = cursorRestoreRef.current;
    cursorRestoreRef.current = null;
  }, []);

  const showPointerCursor = useCallback(() => {
    if (cursorRestoreRef.current !== null || typeof document === "undefined") {
      return;
    }
    cursorRestoreRef.current = document.body.style.cursor;
    document.body.style.cursor = "pointer";
  }, []);

  const clearHover = useCallback(() => {
    const previous = hoveredRef.current;
    if (!previous) {
      restoreCursor();
      return;
    }
    hoveredRef.current = null;
    previous.record.layer.onHoverEntity?.(null);
    onHoverChangeRef.current(previous, null);
    restoreCursor();
  }, [restoreCursor]);

  const hoverIndex = useCallback(
    (index: number | null) => {
      if (!enabledRef.current || index === null) {
        clearHover();
        return;
      }
      const record = recordsRef.current[index];
      if (!record) {
        clearHover();
        return;
      }
      const previous = hoveredRef.current;
      if (previous?.key === record.key) {
        return;
      }
      if (previous) {
        previous.record.layer.onHoverEntity?.(null);
      }
      const next = { index, key: record.key, record };
      hoveredRef.current = next;
      onHoverChangeRef.current(previous, next);
      record.layer.onHoverEntity?.(record.entityId);
      showPointerCursor();
    },
    [clearHover, showPointerCursor],
  );

  const commitRecords = useCallback(
    (records: readonly SceneCubeBatchRecord[]): string | null => {
      const previous = hoveredRef.current;
      recordsRef.current = records;
      if (!previous || !enabledRef.current) {
        if (previous) {
          previous.record.layer.onHoverEntity?.(null);
          hoveredRef.current = null;
          restoreCursor();
        }
        return null;
      }
      const nextIndex = records.findIndex(
        (record) => record.key === previous.key,
      );
      if (nextIndex < 0) {
        previous.record.layer.onHoverEntity?.(null);
        hoveredRef.current = null;
        restoreCursor();
        return null;
      }
      hoveredRef.current = {
        index: nextIndex,
        key: previous.key,
        record: records[nextIndex],
      };
      return previous.key;
    },
    [restoreCursor],
  );

  const onClick = useCallback((event: ThreeEvent<MouseEvent>) => {
    if (!enabledRef.current || event.delta > CLICK_DRAG_TOLERANCE_PX) {
      return;
    }
    const index = resolveIndexRef.current(event);
    const record = index === null ? undefined : recordsRef.current[index];
    if (!record?.layer.onSelectEntity) {
      return;
    }
    event.stopPropagation();
    record.layer.onSelectEntity(record.entityId, {
      shiftKey: event.nativeEvent.shiftKey,
    });
  }, []);

  const onPointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!enabledRef.current) {
        return;
      }
      const index = resolveIndexRef.current(event);
      if (index === null) {
        return;
      }
      event.stopPropagation();
      hoverIndex(index);
    },
    [hoverIndex],
  );

  const onPointerOut = useCallback(
    (_event: ThreeEvent<PointerEvent>) => clearHover(),
    [clearHover],
  );

  // This layout effect keeps point-picking blockers aligned with interactivity.
  useLayoutEffect(() => {
    object.userData = enabled ? { ...POINT_PICK_BLOCKING_USER_DATA } : {};
    if (!enabled) {
      clearHover();
    }
    return () => {
      object.userData = {};
    };
  }, [clearHover, enabled, object]);

  // This effect clears host hover and cursor state if the batch unmounts.
  useEffect(
    () => () => {
      const hovered = hoveredRef.current;
      if (hovered) {
        hovered.record.layer.onHoverEntity?.(null);
        hoveredRef.current = null;
      }
      restoreCursor();
    },
    [restoreCursor],
  );

  return useMemo(
    () => ({
      commitRecords,
      enabled,
      onClick,
      onPointerMove,
      onPointerOut,
      onPointerOver: onPointerMove,
    }),
    [commitRecords, enabled, onClick, onPointerMove, onPointerOut],
  );
}

/** Resolves an InstancedMesh pointer event to its owning cube record. */
export function normalCubeIndexForEvent(
  event: CubePointerEvent,
): number | null {
  return Number.isInteger(event.instanceId) ? (event.instanceId ?? null) : null;
}

/** Resolves a selected line segment pointer event to its owning cube record. */
export function selectedCubeIndexForEvent(
  event: CubePointerEvent,
): number | null {
  return Number.isInteger(event.index)
    ? Math.floor((event.index ?? 0) / SELECTED_BOX_VERTEX_COUNT)
    : null;
}

function updateNormalCubeHover(
  resource: SceneCubeBatchResource,
  previous: HoveredCubeRecord | null,
  next: HoveredCubeRecord | null,
): void {
  const colorArray = resource.colorAttribute.array as Float32Array;
  const opacityArray = resource.opacityAttribute.array as Float32Array;
  if (previous) {
    writeCubeAppearance(
      colorArray,
      opacityArray,
      previous.index,
      previous.record,
      false,
    );
  }
  if (next) {
    writeCubeAppearance(
      colorArray,
      opacityArray,
      next.index,
      next.record,
      true,
    );
  }
  markSparseAttributeUpdated(
    resource.colorAttribute,
    CUBE_COMPONENT_COUNT,
    previous?.index,
    next?.index,
  );
  markSparseAttributeUpdated(
    resource.opacityAttribute,
    1,
    previous?.index,
    next?.index,
  );
}

function writeCubeAppearance(
  colors: Float32Array,
  opacities: Float32Array,
  index: number,
  record: SceneCubeBatchRecord,
  emphasized: boolean,
): void {
  const colorOffset = index * CUBE_COMPONENT_COUNT;
  if (emphasized) {
    colors[colorOffset] = 1;
    colors[colorOffset + 1] = 1;
    colors[colorOffset + 2] = 1;
    opacities[index] = 1;
    return;
  }

  const [r, g, b, a] = record.cube.color ?? DEFAULT_SCENE_CUBE_COLOR;
  colors[colorOffset] = clamp01(r);
  colors[colorOffset + 1] = clamp01(g);
  colors[colorOffset + 2] = clamp01(b);
  opacities[index] = Math.max(
    CUBE_MIN_OPACITY,
    Math.min(CUBE_WIREFRAME_MAX_OPACITY, clamp01(a)),
  );
}

function composeFrameMatrix(
  layer: SceneAnnotationPanelLayer,
  target: THREE.Matrix4,
  quaternion: THREE.Quaternion,
): void {
  const transform = layer.frameTransform;
  if (!transform) {
    target.identity();
    return;
  }
  quaternion.copy(transform.rotation);
  normalizeQuaternion(quaternion);
  target.compose(transform.translation, quaternion, UNIT_SCALE);
}

function composeCubeMatrix(
  cube: SceneCubePrimitive,
  target: THREE.Matrix4,
  quaternion: THREE.Quaternion,
  position: THREE.Vector3,
  scale: THREE.Vector3,
): void {
  position.fromArray(cube.pose.position);
  quaternion.set(...cube.pose.quaternion);
  normalizeQuaternion(quaternion);
  scale.fromArray(cube.size);
  target.compose(position, quaternion, scale);
}

function normalizeQuaternion(quaternion: THREE.Quaternion): void {
  if (quaternion.lengthSq() === 0) {
    quaternion.identity();
  } else {
    quaternion.normalize();
  }
}

const UNIT_SCALE = new THREE.Vector3(1, 1, 1);

function sceneEntityHasNonCubePrimitives(
  entity: SceneEntityVisualization,
): boolean {
  return (
    entity.arrows.length > 0 ||
    entity.cylinders.length > 0 ||
    entity.lines.length > 0 ||
    entity.models.length > 0 ||
    entity.spheres.length > 0 ||
    entity.triangles.length > 0
  );
}

function instanceCapacity(count: number): number {
  let capacity = 1;
  while (capacity < count) {
    capacity *= 2;
  }
  return capacity;
}

function useGrowingInstanceCapacity(count: number): number {
  const capacityRef = useRef(1);
  capacityRef.current = Math.max(capacityRef.current, instanceCapacity(count));
  return capacityRef.current;
}

function markAttributeUpdated(
  attribute: THREE.BufferAttribute,
  componentCount: number,
): void {
  if (componentCount === 0) {
    return;
  }
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, componentCount);
  attribute.needsUpdate = true;
}

function markSparseAttributeUpdated(
  attribute: THREE.BufferAttribute,
  itemSize: number,
  ...indices: readonly (number | undefined)[]
): void {
  const uniqueIndices = new Set(
    indices.filter((index): index is number => index !== undefined),
  );
  if (uniqueIndices.size === 0) {
    return;
  }
  attribute.clearUpdateRanges();
  for (const index of uniqueIndices) {
    attribute.addUpdateRange(index * itemSize, itemSize);
  }
  attribute.needsUpdate = true;
}
