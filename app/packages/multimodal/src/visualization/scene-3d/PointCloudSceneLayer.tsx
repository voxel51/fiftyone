/* eslint-disable react/no-unknown-property */
import { useFrame, useThree } from "@react-three/fiber";
import {
  memo,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import * as THREE from "three";
import * as TSL from "three/tsl";
import { PointsNodeMaterial } from "three/webgpu";

import type { PointCloudRenderPayload } from "../../ir";
import { pointCloudChannelEncodingKey } from "../../ir";
import {
  createGpuPointCloudColorNode,
  createGpuPointCloudColorUniforms,
  gpuPointCloudColorNodeKey,
  updateGpuPointCloudColorUniforms,
  type GpuPointCloudColorUniforms,
} from "./gpu/gpu-point-cloud-color-nodes";
import type { ResolvedGpuPointCloudColor } from "./gpu/gpu-point-cloud-color";
import {
  createGpuPointCloudChannelResource,
  gpuPointCloudChannelValueNode,
  gpuPointCloudRgbNode,
  updateGpuPointCloudChannelResource,
  type GpuPointCloudChannelResource,
} from "./gpu/gpu-point-cloud-channel-nodes";
import {
  gpuPointCloudPositionNode,
  gpuPointCloudSampleIndexNode,
} from "./gpu/gpu-point-cloud-position-nodes";
import {
  createPointCloudSpriteMaterial,
  type PointCloudInstanceAttributes,
} from "./gpu/point-cloud-sprite-material";
import { POINT_COMPONENT_COUNT } from "./point-cloud-colors";
import {
  GpuPointCloud3dPickerRegistryContext,
  type GpuPointCloud3dPickLayer,
} from "./gpu/gpu-point-cloud-3d-picker";
import { pointCloudObjectTransform } from "./transforms";
import type {
  PointCloudHoveredPointMarker,
  PointCloudPanelLayer,
  PointCloudRenderData,
} from "./types";
import { useInvalidateOn } from "./use-invalidate-on";

export {
  createPointCloudSpriteMaterial,
  type PointCloudInstanceAttributes,
} from "./gpu/point-cloud-sprite-material";

// Default point sprite size in pixels. Lives here (not in the panel) so
// the offscreen snapshot renderer can share it without importing the
// panel's WebGPU canvas dependency graph.
export const DEFAULT_POINT_SIZE = 2;
export const POINT_CLOUD_POINTS_MATERIAL_PROPS = {
  sizeAttenuation: false,
  vertexColors: true,
} as const;

export const WEBGPU_POINT_PRIMITIVE_SIZE_PX = 1;
const NOOP_RAYCAST = () => undefined;

/** Decoder-owned sampled arrays and resolved style for the zero-copy GPU path. */
export interface GpuPointCloudSceneData {
  readonly color: ResolvedGpuPointCloudColor;
  readonly payload: PointCloudRenderPayload;
  readonly renderedPointCount: number;
  /** Stable within this canvas; includes the layer id and source content time. */
  readonly resourceKey?: string;
}

// Memoized: callers keep layer/data/gpu identity stable across renders their
// content didn't cause (useKeyedIdentityMap), so unrelated ticks and hovers
// skip this subtree entirely.
export const PointCloudSceneLayer = memo(function PointCloudSceneLayer({
  data,
  gpu,
  layer,
  pointSize,
}: {
  readonly data: PointCloudRenderData;
  readonly gpu?: GpuPointCloudSceneData;
  readonly layer: PointCloudPanelLayer;
  readonly pointSize: number;
}) {
  const { frameTransform, hoveredPoint } = layer;
  const objectTransform = useMemo(
    () => pointCloudObjectTransform(frameTransform),
    [frameTransform],
  );

  useInvalidateOn([objectTransform, hoveredPoint]);

  return (
    <group
      position={objectTransform.position}
      quaternion={objectTransform.quaternion}
    >
      {gpu ? (
        <GpuPointCloudPoints
          gpu={gpu}
          layerId={layer.onHoverPoint ? layer.id : undefined}
          pointSize={pointSize}
        />
      ) : (
        <PointCloudPoints
          data={data}
          layerId={layer.onHoverPoint ? layer.id : undefined}
          pointSize={pointSize}
        />
      )}
      {hoveredPoint ? (
        <HoveredPointMarker marker={hoveredPoint} pointSize={pointSize} />
      ) : null}
    </group>
  );
});

interface GpuPointCloud3dResource {
  readonly capacity: number;
  color: GpuPointCloudChannelResource | null;
  readonly position: THREE.BufferAttribute;
  renderedPointCount: number;
  sampledPointCount: number;
  readonly scalar: Map<string, GpuPointCloudChannelResource>;
  readonly spriteGeometry: THREE.PlaneGeometry;
}

interface GpuPointCloud3dMaterial {
  readonly colorUniforms: GpuPointCloudColorUniforms;
  readonly material: PointsNodeMaterial;
}

const EMPTY_GPU_INSTANCE_ATTRIBUTES = new Map<
  string,
  THREE.InstancedBufferAttribute
>();

/**
 * Renders decoder-prepared samples without rescanning or copying their point
 * and channel arrays. The visible instanced sprite is fully positioned and
 * coloured in the WebGPU vertex graph; dwell picking shares the same storage
 * attribute through the canvas-local GPU picker registry.
 */
function GpuPointCloudPoints({
  gpu,
  layerId,
  pointSize,
}: {
  readonly gpu: GpuPointCloudSceneData;
  /** Set only when the layer is pickable. */
  readonly layerId?: string;
  readonly pointSize: number;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const pickerRegistry = useContext(GpuPointCloud3dPickerRegistryContext);
  const capacityRef = useRef(0);
  // Capacity is monotonic for this mounted layer. Smaller later frames reuse
  // the existing GPU allocation; only a larger worker bucket replaces it.
  if (gpu.payload.capacity > capacityRef.current) {
    capacityRef.current = gpu.payload.capacity;
  }
  const capacity = capacityRef.current;
  const resource = useMemo(
    () => createGpuPointCloud3dResource(gpu.payload, capacity),
    // Capacity is grow-only. The current payload seeds a newly grown buffer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [capacity],
  );
  // Fields may appear after the first frame. Schema growth must happen before
  // material construction because TSL storage bindings define shader topology.
  ensureGpuPointCloud3dSchema(resource, gpu.payload);
  const colorNodeKey = gpuPointCloudColorNodeKey(gpu.color);
  // Rebuild only when the chosen color source changes graph shape (for
  // example uniform -> scalar field). Ranges, ramps, and per-frame values are
  // uniforms or replacement attribute arrays applied below.
  const shader = useMemo(
    () => createGpuPointCloud3dMaterial(resource, gpu.color),
    // Frame values and point size are mutable uniforms/properties.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colorNodeKey, resource],
  );
  const sprite = useMemo(() => {
    const instanceSprite = new THREE.Sprite(
      shader.material as unknown as THREE.SpriteMaterial,
    );
    instanceSprite.count = 0;
    instanceSprite.frustumCulled = false;
    instanceSprite.geometry = resource.spriteGeometry;
    instanceSprite.raycast = NOOP_RAYCAST;
    return instanceSprite;
  }, [resource, shader.material]);
  const pickLayer = useMemo<GpuPointCloud3dPickLayer | null>(
    () =>
      layerId
        ? {
            colorAttribute: null,
            layerId,
            object: sprite,
            positionAttribute: resource.position,
            positionLayout: "flat",
            renderedPointCount: 0,
            resourceKey: layerId,
            sampledPointCount: 0,
          }
        : null,
    [layerId, resource.position, sprite],
  );
  const appliedContentRef = useRef<string | PointCloudRenderPayload | null>(
    null,
  );

  useLayoutEffect(() => {
    // Layout timing is intentional: swap typed-array views and uniforms after
    // React commits this scene but before R3F can submit its next frame.
    const contentIdentity = gpu.resourceKey ?? gpu.payload;
    if (appliedContentRef.current !== contentIdentity) {
      updateGpuPointCloud3dResource(resource, gpu.payload);
      appliedContentRef.current = contentIdentity;
    }
    resource.sampledPointCount = gpu.payload.sampledPointCount;
    resource.renderedPointCount = gpu.renderedPointCount;
    sprite.count = gpu.renderedPointCount;
    shader.material.size = pointSize;
    updateGpuPointCloudColorUniforms(shader.colorUniforms, gpu.color);
    if (pickLayer) {
      // The picker holds the same position BufferAttribute object. Notify it
      // after counts/frame identity change so pending reads are invalidated.
      pickLayer.renderedPointCount = gpu.renderedPointCount;
      pickLayer.resourceKey = gpu.resourceKey ?? pickLayer.layerId;
      pickLayer.sampledPointCount = gpu.payload.sampledPointCount;
      pickerRegistry?.notify();
    }
    invalidate();
  }, [
    gpu,
    invalidate,
    pickLayer,
    pickerRegistry,
    pointSize,
    resource,
    shader,
    sprite,
  ]);
  useLayoutEffect(() => {
    if (!pickLayer || !pickerRegistry) {
      return undefined;
    }
    return pickerRegistry.register(pickLayer);
  }, [pickLayer, pickerRegistry]);
  useEffect(
    () => () => {
      resource.spriteGeometry.dispose();
    },
    [resource],
  );
  useEffect(() => () => shader.material.dispose(), [shader.material]);

  return <primitive object={sprite} />;
}

function createGpuPointCloud3dResource(
  payload: PointCloudRenderPayload,
  capacity: number,
): GpuPointCloud3dResource {
  // Flat float storage avoids Three's main-thread vec3→vec4 padding
  // pass for WebGPU storage buffers. The shader reconstructs vec3 values.
  const position = new THREE.BufferAttribute(payload.positions, 1);
  const color = payload.rgb
    ? createGpuPointCloudChannelResource(payload.rgb)
    : null;
  const scalar = new Map<string, GpuPointCloudChannelResource>();
  for (const field of payload.scalarFields) {
    scalar.set(field.name, createGpuPointCloudChannelResource(field));
  }
  // PointsNodeMaterial on WebGPU renders instanced screen-aligned quads. A
  // one-quad geometry supplies ownership/lifetime; point data comes from node
  // storage attributes rather than the quad's vertex positions.
  const spriteGeometry = new THREE.PlaneGeometry(1, 1);
  // Three's WebGPU renderer releases node-owned buffers through geometry
  // disposal, so every prepared attribute is attached under a private name.
  spriteGeometry.setAttribute("pointPosition", position);
  if (color) {
    spriteGeometry.setAttribute("pointColor", color.attribute);
  }
  let scalarIndex = 0;
  for (const channel of scalar.values()) {
    spriteGeometry.setAttribute(
      `pointScalar${scalarIndex++}`,
      channel.attribute,
    );
  }

  return {
    capacity,
    color,
    position,
    renderedPointCount: 0,
    sampledPointCount: payload.sampledPointCount,
    scalar,
    spriteGeometry,
  };
}

function createGpuPointCloud3dMaterial(
  resource: GpuPointCloud3dResource,
  color: ResolvedGpuPointCloudColor,
): GpuPointCloud3dMaterial {
  const material = new PointsNodeMaterial({
    size: DEFAULT_POINT_SIZE,
    sizeAttenuation: false,
  });
  // instanceIndex spans the progressively ordered payload prefix, allowing
  // runtime point budgets without new CPU arrays or point replacement.
  const sampleIndex = gpuPointCloudSampleIndexNode();
  const positionNode = gpuPointCloudPositionNode(
    resource.position,
    "flat",
    sampleIndex,
  );
  const colorNode = resource.color
    ? gpuPointCloudRgbNode(resource.color, sampleIndex)
    : null;
  const scalarNodes = new Map<string, TSL.Node>();
  for (const [name, channel] of resource.scalar) {
    scalarNodes.set(name, gpuPointCloudChannelValueNode(channel, sampleIndex));
  }
  material.positionNode = positionNode;
  const colorUniforms = createGpuPointCloudColorUniforms(color);
  material.colorNode = createGpuPointCloudColorNode(
    color,
    {
      color: null,
      colorNode,
      positionNode,
      scalar: EMPTY_GPU_INSTANCE_ATTRIBUTES,
      scalarNodes,
    },
    colorUniforms,
  );
  material.toneMapped = false;
  return { colorUniforms, material };
}

function ensureGpuPointCloud3dSchema(
  resource: GpuPointCloud3dResource,
  payload: PointCloudRenderPayload,
): void {
  // Schema is grow-only within one capacity resource. Removing an optional
  // channel does not invalidate its binding; the active color policy decides
  // whether the compiled material reads it.
  if (
    payload.rgb &&
    (!resource.color ||
      pointCloudChannelEncodingKey(resource.color.encoding) !==
        pointCloudChannelEncodingKey(payload.rgb.encoding))
  ) {
    resource.color = createGpuPointCloudChannelResource(payload.rgb);
    resource.spriteGeometry.setAttribute(
      "pointColor",
      resource.color.attribute,
    );
  }
  let addedScalar = false;
  for (const field of payload.scalarFields) {
    const existing = resource.scalar.get(field.name);
    if (
      existing &&
      pointCloudChannelEncodingKey(existing.encoding) ===
        pointCloudChannelEncodingKey(field.encoding)
    ) {
      continue;
    }
    resource.scalar.set(field.name, createGpuPointCloudChannelResource(field));
    addedScalar = true;
  }
  if (addedScalar) attachGpuPointCloud3dScalars(resource);
}

function updateGpuPointCloud3dResource(
  resource: GpuPointCloud3dResource,
  payload: PointCloudRenderPayload,
): void {
  // Replace transferred ArrayBuffer views instead of copying point data on the
  // main thread. needsUpdate below tells Three to upload the new view once.
  replaceGpuPointCloud3dArray(resource.position, payload.positions);
  if (payload.rgb && resource.color) {
    const previous = resource.color;
    resource.color = updateGpuPointCloudChannelResource(
      resource.color,
      payload.rgb,
    );
    if (resource.color !== previous) {
      resource.spriteGeometry.setAttribute(
        "pointColor",
        resource.color.attribute,
      );
    }
  }
  for (const field of payload.scalarFields) {
    const channel = resource.scalar.get(field.name);
    if (!channel) continue;
    const updated = updateGpuPointCloudChannelResource(channel, field);
    if (updated !== channel) {
      resource.scalar.set(field.name, updated);
      attachGpuPointCloud3dScalars(resource);
    }
  }
}

function replaceGpuPointCloud3dArray(
  attribute: THREE.BufferAttribute,
  array: Float32Array,
): void {
  attribute.array = array;
  (attribute as unknown as { count: number }).count = array.length;
  attribute.needsUpdate = true;
}

function attachGpuPointCloud3dScalars(resource: GpuPointCloud3dResource): void {
  let scalarIndex = 0;
  for (const channel of resource.scalar.values()) {
    resource.spriteGeometry.setAttribute(
      `pointScalar${scalarIndex++}`,
      channel.attribute,
    );
  }
}

// Small clouds (radar sweeps) share one bucket so per-tick count jitter
// never reallocates their geometry.
const MIN_POINT_CAPACITY = 1_024;
const POINT_PICK_POSITION_ATTRIBUTE = "pointPickPosition";

function PointCloudPoints({
  data,
  layerId,
  pointSize,
}: {
  readonly data: PointCloudRenderData;
  /** Set only when the layer is pickable. */
  readonly layerId?: string;
  readonly pointSize: number;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const pickerRegistry = useContext(GpuPointCloud3dPickerRegistryContext);
  const pointsRef = useRef<THREE.Points | null>(null);
  const pickLayerRef = useRef<GpuPointCloud3dPickLayer | null>(null);
  // Grow-only capacity in power-of-two buckets: playback ticks fluctuate a
  // few points around a stable count, and a boundary-straddling count must
  // not thrash between two buckets.
  const capacityRef = useRef(0);
  const requiredPoints = Math.ceil(
    data.positions.length / POINT_COMPONENT_COUNT,
  );
  if (requiredPoints > capacityRef.current) {
    capacityRef.current = Math.max(
      MIN_POINT_CAPACITY,
      2 ** Math.ceil(Math.log2(Math.max(1, requiredPoints))),
    );
  }
  const capacity = capacityRef.current;
  const geometry = useMemo(
    () => createPointCloudGeometry(capacity),
    [capacity],
  );

  // This layout effect copies each tick's points into the persistent
  // geometry before the next paint. Reusing one geometry per points object
  // (instead of swapping in a fresh one per tick) keeps the render-object ↔
  // geometry pairing stable and replaces per-tick GPU buffer create/destroy
  // churn with in-place writes.
  useLayoutEffect(() => {
    applyPointCloudData(geometry, data);
    const pickLayer = pickLayerRef.current;
    if (pickLayer) {
      pickLayer.renderedPointCount = data.renderedPointCount;
      pickLayer.sampledPointCount = data.renderedPointCount;
      pickerRegistry?.notify();
    }
    invalidate();
  }, [data, geometry, invalidate, pickerRegistry]);

  useLayoutEffect(() => {
    const object = pointsRef.current;
    if (!layerId || !object || !pickerRegistry) {
      return undefined;
    }
    const pickLayer: GpuPointCloud3dPickLayer = {
      colorAttribute: geometry.getAttribute("color") as THREE.BufferAttribute,
      layerId,
      object,
      positionAttribute: geometry.getAttribute(
        POINT_PICK_POSITION_ATTRIBUTE,
      ) as THREE.BufferAttribute,
      positionLayout: "flat",
      renderedPointCount: data.renderedPointCount,
      resourceKey: layerId,
      sampledPointCount: data.renderedPointCount,
    };
    pickLayerRef.current = pickLayer;
    const unregister = pickerRegistry.register(pickLayer);
    return () => {
      unregister();
      if (pickLayerRef.current === pickLayer) {
        pickLayerRef.current = null;
      }
    };
    // Frame data mutates the registered layer in the preceding layout effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, layerId, pickerRegistry]);

  // This effect disposes the GPU geometry when capacity grows or on unmount.
  useEffect(() => () => geometry.dispose(), [geometry]);

  // Keying by capacity retires the points object together with its
  // geometry, so a geometry is never swapped into a live three object.
  return (
    <points
      key={capacity}
      frustumCulled={false}
      raycast={NOOP_RAYCAST}
      ref={(object) => {
        pointsRef.current = object as unknown as THREE.Points | null;
      }}
    >
      <primitive attach="geometry" object={geometry} />
      <pointsMaterial {...POINT_CLOUD_POINTS_MATERIAL_PROPS} size={pointSize} />
      {pointSize > WEBGPU_POINT_PRIMITIVE_SIZE_PX ? (
        <PointCloudSizedSprites
          capacity={capacity}
          data={data}
          pointSize={pointSize}
        />
      ) : null}
    </points>
  );
}

// Hover emphasis: the marker grows the point by 10% in its original color,
// easing in over a short beat. The marker is
// screen-space sized (sizeAttenuation off) with a pixel floor, so the
// intersected point reads clearly at any zoom or point size.
const HOVERED_POINT_GROWTH = 1.1;
const HOVER_EMPHASIS_ANIMATION_MS = 150;
const HOVERED_POINT_MIN_SCREEN_PX = 8;
const HOVERED_POINT_RENDER_ORDER = 9_000;
const DEFAULT_HOVER_EMPHASIS: readonly [number, number, number] = [1, 1, 1];

/**
 * Screen-space emphasis dot rendered over the hovered cloud point, in
 * the cloud's sensor frame so the parent group places it exactly like
 * the point it marks. Uses the same instanced-sprite mechanism as
 * {@link PointCloudSizedSprites} because plain WebGPU point primitives
 * ignore material size. Depth testing is off so the emphasis reads over
 * neighboring points.
 */
function HoveredPointMarker({
  marker,
  pointSize,
}: {
  readonly marker: PointCloudHoveredPointMarker;
  readonly pointSize: number;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const baseSizePx = Math.max(pointSize, HOVERED_POINT_MIN_SCREEN_PX);
  const attributes = useMemo(() => createPointCloudInstanceAttributes(1), []);
  const material = useMemo(() => {
    const spriteMaterial = createPointCloudSpriteMaterial(
      attributes,
      baseSizePx,
      true,
    );
    spriteMaterial.depthTest = false;
    spriteMaterial.depthWrite = false;
    return spriteMaterial;
  }, [attributes, baseSizePx]);
  const sprite = useMemo(() => {
    const instanceSprite = new THREE.Sprite(
      material as unknown as THREE.SpriteMaterial,
    );
    instanceSprite.count = 1;
    instanceSprite.frustumCulled = false;
    instanceSprite.raycast = NOOP_RAYCAST;
    instanceSprite.renderOrder = HOVERED_POINT_RENDER_ORDER;
    return instanceSprite;
  }, [material]);
  const animationStartRef = useRef(0);

  // This layout effect repositions/recolors the marker and restarts the
  // grow-in whenever the hovered point changes.
  useLayoutEffect(() => {
    const emphasis = marker.color ?? DEFAULT_HOVER_EMPHASIS;
    (attributes.position.array as Float32Array).set(marker.position);
    (attributes.color.array as Float32Array).set(emphasis);
    markAttributeUpdated(attributes.position, POINT_COMPONENT_COUNT);
    markAttributeUpdated(attributes.color, POINT_COMPONENT_COUNT);
    animationStartRef.current = performance.now();
    material.size = baseSizePx;
    invalidate();
  }, [attributes, baseSizePx, invalidate, marker, material]);

  // Grow-in on the demand frameloop: each rendered frame advances the
  // eased size and re-invalidates until the animation lands.
  useFrame(() => {
    const elapsed = performance.now() - animationStartRef.current;
    const t = Math.min(1, elapsed / HOVER_EMPHASIS_ANIMATION_MS);
    const eased = 1 - (1 - t) ** 3;
    material.size = baseSizePx * (1 + (HOVERED_POINT_GROWTH - 1) * eased);
    if (t < 1) {
      invalidate();
    }
  });

  useEffect(() => () => material.dispose(), [material]);

  return <primitive object={sprite} />;
}

function PointCloudSizedSprites({
  capacity,
  data,
  pointSize,
}: {
  readonly capacity: number;
  readonly data: PointCloudRenderData;
  readonly pointSize: number;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const attributes = useMemo(
    () => createPointCloudInstanceAttributes(capacity),
    [capacity],
  );
  const material = useMemo(
    () => createPointCloudSpriteMaterial(attributes, pointSize),
    [attributes, pointSize],
  );
  const sprite = useMemo(() => {
    const instanceSprite = new THREE.Sprite(
      material as unknown as THREE.SpriteMaterial,
    );
    instanceSprite.frustumCulled = false;
    instanceSprite.raycast = NOOP_RAYCAST;
    return instanceSprite;
  }, [material]);

  useLayoutEffect(() => {
    applyPointCloudInstanceData(attributes, data);
    sprite.count = data.renderedPointCount;
    invalidate();
  }, [attributes, data, invalidate, sprite]);

  useEffect(
    () => () => {
      material.dispose();
    },
    [material],
  );

  return <primitive key={capacity} object={sprite} />;
}

/**
 * Builds the persistent point-cloud geometry at a fixed point capacity.
 * Shared with the offscreen snapshot renderer so live and snapshot paths
 * produce byte-identical geometry (static usage, capacity-sized buffers).
 */
export function createPointCloudGeometry(capacityPoints: number) {
  const geometry = new THREE.BufferGeometry();
  // Default (static) usage on purpose: the WebGPU backend re-uploads the
  // full array on every render for DynamicDrawUsage, while static usage
  // uploads only when a version bump (needsUpdate) says the data changed.
  const positionAttribute = new THREE.BufferAttribute(
    new Float32Array(capacityPoints * POINT_COMPONENT_COUNT),
    POINT_COMPONENT_COUNT,
  );
  const colorAttribute = new THREE.BufferAttribute(
    new Float32Array(capacityPoints * POINT_COMPONENT_COUNT),
    POINT_COMPONENT_COUNT,
  );
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("color", colorAttribute);
  // CPU-prepared frames already own compact render data. The picker gets a
  // flat storage view over the same array (no CPU copy); using a distinct
  // attribute keeps Three from padding the visible vec3 vertex buffer.
  geometry.setAttribute(
    POINT_PICK_POSITION_ATTRIBUTE,
    new THREE.BufferAttribute(positionAttribute.array, 1),
  );
  geometry.setDrawRange(0, 0);

  return geometry;
}

export function createPointCloudInstanceAttributes(
  capacityPoints: number,
): PointCloudInstanceAttributes {
  return {
    color: new THREE.InstancedBufferAttribute(
      new Float32Array(capacityPoints * POINT_COMPONENT_COUNT),
      POINT_COMPONENT_COUNT,
    ),
    position: new THREE.InstancedBufferAttribute(
      new Float32Array(capacityPoints * POINT_COMPONENT_COUNT),
      POINT_COMPONENT_COUNT,
    ),
  };
}

/**
 * Copies one frame's render data into the persistent geometry (in-place
 * writes, update ranges, draw range, bounds). Shared with the snapshot
 * renderer for the same reason as {@link createPointCloudGeometry}.
 */
export function applyPointCloudData(
  geometry: THREE.BufferGeometry,
  data: PointCloudRenderData,
) {
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const pickPosition = geometry.getAttribute(
    POINT_PICK_POSITION_ATTRIBUTE,
  ) as THREE.BufferAttribute;
  const color = geometry.getAttribute("color") as THREE.BufferAttribute;
  (position.array as Float32Array).set(data.positions);
  (color.array as Float32Array).set(data.colors);
  markAttributeUpdated(position, data.positions.length);
  markAttributeUpdated(pickPosition, data.positions.length);
  markAttributeUpdated(color, data.colors.length);
  geometry.setDrawRange(0, data.renderedPointCount);
  geometry.boundingBox = data.bounds.clone();
  geometry.boundingSphere = data.bounds.getBoundingSphere(new THREE.Sphere());
}

export function applyPointCloudInstanceData(
  attributes: PointCloudInstanceAttributes,
  data: PointCloudRenderData,
) {
  (attributes.position.array as Float32Array).set(data.positions);
  (attributes.color.array as Float32Array).set(data.colors);
  markAttributeUpdated(attributes.position, data.positions.length);
  markAttributeUpdated(attributes.color, data.colors.length);
}

function markAttributeUpdated(
  attribute: THREE.BufferAttribute,
  componentCount: number,
) {
  // An empty tick draws nothing (draw range 0), so skip the GPU write: with
  // no update range, the backend would upload the entire capacity array.
  if (componentCount === 0) {
    return;
  }
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, componentCount);
  attribute.needsUpdate = true;
}
