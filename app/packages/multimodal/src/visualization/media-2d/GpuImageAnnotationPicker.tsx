import { useThree } from "@react-three/fiber";
import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import * as THREE from "three";
import * as TSL from "three/tsl";
import { PointsNodeMaterial } from "three/webgpu";

import {
  createGpuPickController,
  type GpuPickPass,
} from "../webgpu/gpu-pick-controller";
import { isGpuPickRenderer } from "../webgpu/gpu-pick-render-target";
import { IMAGE_ANNOTATION_PICK_KIND } from "./gpu-image-annotation-preparation";
import type {
  GpuImageAnnotationPickResource,
  GpuImageAnnotationResource,
} from "./gpu-image-annotation-resources";
import type {
  ImageAnnotationPickNode,
  ImageAnnotationPickTslFacade,
  ImageAnnotationPickUniformNode,
} from "../tsl-chainables";

const CULLED_POSITION = 1e9;
const DISTANCE_EPSILON = 1e-6;

interface PickMaterial {
  alphaToCoverage: boolean;
  blending: THREE.Blending;
  depthFunc: THREE.DepthModes;
  depthNode: TSL.Node | null;
  depthTest: boolean;
  depthWrite: boolean;
  fog: boolean;
  fragmentNode: TSL.Node | null;
  positionNode: TSL.Node | null;
  scaleNode: ImageAnnotationPickNode | null;
  toneMapped: boolean;
  dispose(): void;
}

const pickTsl: ImageAnnotationPickTslFacade = TSL;

/** Image-pixel target and tolerance for one annotation pick. */
export interface GpuImageAnnotationPickRequest {
  /** Interaction tolerance in displayed-image pixels. */
  readonly radiusPx: number;
  readonly targetU: number;
  readonly targetV: number;
}

/** Primitive identity decoded from the winning integer texel. */
export interface GpuImageAnnotationPickResult {
  readonly primitiveIndex: number;
}

/** Imperative annotation-picking API exposed to the DOM interaction layer. */
export interface GpuImageAnnotationPickerHandle {
  invalidate(): void;
  pick(
    request: GpuImageAnnotationPickRequest,
  ): Promise<GpuImageAnnotationPickResult | null>;
}

/** Stateful picker API used by the R3F bridge and unit tests. */
export interface GpuImageAnnotationPickerController extends GpuImageAnnotationPickerHandle {
  dispose(): void;
  setScene(scene: GpuImageAnnotationPickerScene): void;
}

/** Current image dimensions and shared pick attributes. */
export interface GpuImageAnnotationPickerScene {
  readonly imageHeight: number;
  readonly imageWidth: number;
  readonly resource: GpuImageAnnotationResource;
}

/**
 * Ref-only bridge to a private 1x1 RGBA32Uint pass. Visible annotations and
 * picking bind the same prepared candidate storage.
 */
export const GpuImageAnnotationPicker = forwardRef<
  GpuImageAnnotationPickerHandle,
  GpuImageAnnotationPickerScene
>(function GpuImageAnnotationPicker(
  { imageHeight, imageWidth, resource },
  forwardedRef,
) {
  const gl = useThree((state) => state.gl);
  const controllerRef = useRef<GpuImageAnnotationPickerController | null>(null);
  const handle = useMemo<GpuImageAnnotationPickerHandle>(
    () => ({
      invalidate: () => controllerRef.current?.invalidate(),
      pick: (request) =>
        controllerRef.current?.pick(request) ?? Promise.resolve(null),
    }),
    [],
  );

  // This layout effect owns the picker controller for the active renderer.
  useLayoutEffect(() => {
    const controller = createGpuImageAnnotationPickerController(gl);
    controllerRef.current = controller;
    return () => {
      if (controllerRef.current === controller) controllerRef.current = null;
      controller.dispose();
    };
  }, [gl]);

  // This layout effect synchronizes frame buffers before the browser paints.
  useLayoutEffect(() => {
    controllerRef.current?.setScene({ imageHeight, imageWidth, resource });
  }, [gl, imageHeight, imageWidth, resource, resource.revision]);

  useImperativeHandle(forwardedRef, () => handle, [handle]);
  return null;
});

/** Creates the imperative WebGPU picker used by the bridge and unit tests. */
export function createGpuImageAnnotationPickerController(
  renderer: unknown,
): GpuImageAnnotationPickerController {
  if (!isGpuPickRenderer(renderer)) {
    throw new Error(
      "GPU image annotation picking requires Three WebGPURenderer",
    );
  }
  return createGpuPickController(renderer, {
    createPass: createAnnotationPickPass,
    decodeTexel: decodeAnnotationPickTexel,
    invalidTexelMessage:
      "GPU image annotation picker returned a non-integer texel",
    minimumTexelLength: 4,
  });
}

function decodeAnnotationPickTexel(
  pixels: Uint32Array,
  pass: AnnotationPickPass,
): GpuImageAnnotationPickResult | null {
  if (pixels[0] === 0 || pixels[1] === 0 || pixels[3] === 0) return null;
  const primitiveIndex = pixels[0] - 1;
  const candidateIndex = pixels[1] - 1;
  if (candidateIndex >= pass.count) return null;
  return { primitiveIndex };
}

interface AnnotationPickPass extends GpuPickPass<
  GpuImageAnnotationPickerScene,
  GpuImageAnnotationPickRequest
> {
  count: number;
  imageHeight: number;
  imageWidth: number;
}

function createAnnotationPickPass(
  config: GpuImageAnnotationPickerScene,
): AnnotationPickPass {
  const scene = new THREE.Scene();
  const target = pickTsl.uniform(new THREE.Vector2());
  const radius = pickTsl.uniform<number>(1);
  const material = createGpuImageAnnotationPickMaterialNode({
    resource: config.resource.pick,
    target,
    radius,
  });
  const sprite = new THREE.Sprite(material as unknown as THREE.SpriteMaterial);
  sprite.count = config.resource.pick.count;
  sprite.geometry = config.resource.pick.geometry;
  sprite.frustumCulled = false;
  scene.add(sprite);
  const pass: AnnotationPickPass = {
    count: sprite.count,
    dispose: () => material.dispose(),
    imageHeight: config.imageHeight,
    imageWidth: config.imageWidth,
    preparePick: (request) => {
      if (
        !validPickRequest(request, pass.imageWidth, pass.imageHeight) ||
        pass.count === 0
      ) {
        return false;
      }
      target.value.set(request.targetU, request.targetV);
      radius.value = request.radiusPx;
      return true;
    },
    scene,
    updateScene: (next) => {
      if (!samePickStorage(config.resource.pick, next.resource.pick)) {
        return false;
      }
      sprite.count = next.resource.pick.count;
      pass.count = sprite.count;
      pass.imageWidth = next.imageWidth;
      pass.imageHeight = next.imageHeight;
      return true;
    },
  };
  return pass;
}

/** Builds the analytic integer-output material with fixed request uniforms. */
export function createGpuImageAnnotationPickMaterial(
  resource: GpuImageAnnotationPickResource,
  request: GpuImageAnnotationPickRequest,
): PickMaterial {
  return createGpuImageAnnotationPickMaterialNode({
    radius: pickTsl.uniform(request.radiusPx),
    resource,
    target: pickTsl.uniform(
      new THREE.Vector2(request.targetU, request.targetV),
    ),
  });
}

function createGpuImageAnnotationPickMaterialNode({
  radius,
  resource,
  target,
}: {
  readonly radius: ImageAnnotationPickUniformNode<number>;
  readonly resource: GpuImageAnnotationPickResource;
  readonly target: ImageAnnotationPickUniformNode<THREE.Vector2>;
}): PickMaterial {
  const material = new PointsNodeMaterial({
    size: 1,
    sizeAttenuation: false,
  }) as unknown as PickMaterial;
  material.alphaToCoverage = false;
  material.blending = THREE.NoBlending;
  material.depthFunc = THREE.LessEqualDepth;
  material.depthTest = true;
  material.depthWrite = true;
  material.fog = false;
  material.toneMapped = false;

  const a = attribute(resource.aAttribute, "vec2");
  const b = attribute(resource.bAttribute, "vec2");
  const c = attribute(resource.cAttribute, "vec2");
  const kind = attribute(resource.kindAttribute, "float");
  const order = attribute(resource.orderAttribute, "float");
  const primitiveIndex = attribute(resource.primitiveIndexAttribute, "uint");
  const candidateRadius = attribute(resource.radiusAttribute, "float");
  const discDistance = target.sub(a).length().sub(candidateRadius).max(0);
  const segmentDistanceValue = segmentDistance(target, a, b);
  const rectDelta = annotationRectDelta(target, a, b);
  const rectDistance = rectDelta.length();
  const triangleEdgeDistance = segmentDistance(target, a, b)
    .min(segmentDistance(target, b, c))
    .min(segmentDistance(target, c, a));
  const triangleDistance = pickTsl.select(
    pointInsideTriangle(target, a, b, c),
    pickTsl.float(0),
    triangleEdgeDistance,
  );
  const distance = pickTsl.select(
    pickTsl.lessThan(kind, IMAGE_ANNOTATION_PICK_KIND.SEGMENT - 0.5),
    discDistance,
    pickTsl.select(
      pickTsl.lessThan(kind, IMAGE_ANNOTATION_PICK_KIND.RECT - 0.5),
      segmentDistanceValue,
      pickTsl.select(
        pickTsl.lessThan(kind, IMAGE_ANNOTATION_PICK_KIND.TRIANGLE - 0.5),
        rectDistance,
        triangleDistance,
      ),
    ),
  );
  const visible = pickTsl.lessThanEqual(distance, radius);
  material.positionNode = pickTsl.select(
    visible,
    pickTsl.vec3(0, 0, 0),
    pickTsl.vec3(CULLED_POSITION, CULLED_POSITION, 0),
  );
  material.scaleNode = pickTsl.select(
    visible,
    pickTsl.vec2(1, 1),
    pickTsl.vec2(0, 0),
  );
  // Closest boundary wins. For overlapping interiors, later annotation
  // primitives win via a sub-pixel depth bias that cannot dominate distance.
  material.depthNode = pickTsl.clamp(
    distance
      .div(radius.max(DISTANCE_EPSILON))
      .add(pickTsl.float(DISTANCE_EPSILON).div(order.add(1))),
    0,
    1,
  );
  material.fragmentNode = pickTsl.uvec4(
    primitiveIndex.add(1),
    pickTsl.instanceIndex.add(1),
    pickTsl.uint(0),
    pickTsl.uint(1),
  );
  return material;
}

function segmentDistance(
  point: ImageAnnotationPickNode,
  start: ImageAnnotationPickNode,
  end: ImageAnnotationPickNode,
): ImageAnnotationPickNode {
  const segment = end.sub(start);
  const denominator = pickTsl.dot(segment, segment).max(DISTANCE_EPSILON);
  const t = pickTsl.clamp(
    pickTsl.dot(point.sub(start), segment).div(denominator),
    0,
    1,
  );
  return point.sub(start.add(segment.mul(t))).length();
}

function annotationRectDelta(
  point: ImageAnnotationPickNode,
  min: ImageAnnotationPickNode,
  max: ImageAnnotationPickNode,
): ImageAnnotationPickNode {
  return pickTsl.vec2(
    min.x.sub(point.x).max(point.x.sub(max.x)).max(0),
    min.y.sub(point.y).max(point.y.sub(max.y)).max(0),
  );
}

function pointInsideTriangle(
  point: ImageAnnotationPickNode,
  a: ImageAnnotationPickNode,
  b: ImageAnnotationPickNode,
  c: ImageAnnotationPickNode,
): ImageAnnotationPickNode {
  const ab = b.sub(a);
  const bc = c.sub(b);
  const ca = a.sub(c);
  const ap = point.sub(a);
  const bp = point.sub(b);
  const cp = point.sub(c);
  const first = cross2(ab, ap);
  const second = cross2(bc, bp);
  const third = cross2(ca, cp);
  const hasNegative = pickTsl.or(
    pickTsl.lessThan(first, 0),
    pickTsl.lessThan(second, 0),
    pickTsl.lessThan(third, 0),
  );
  const hasPositive = pickTsl.or(
    pickTsl.greaterThan(first, 0),
    pickTsl.greaterThan(second, 0),
    pickTsl.greaterThan(third, 0),
  );
  const nonDegenerate = pickTsl.greaterThan(cross2(ab, c.sub(a)).abs(), 1e-9);
  return pickTsl.and(
    nonDegenerate,
    pickTsl.not(pickTsl.and(hasNegative, hasPositive)),
  );
}

function cross2(
  left: ImageAnnotationPickNode,
  right: ImageAnnotationPickNode,
): ImageAnnotationPickNode {
  return left.x.mul(right.y).sub(left.y.mul(right.x));
}

function attribute(
  value: THREE.InstancedBufferAttribute,
  type: "float" | "uint" | "vec2",
): ImageAnnotationPickNode {
  return TSL.instancedBufferAttribute<ImageAnnotationPickNode>(value, type);
}

function samePickStorage(
  current: GpuImageAnnotationPickResource,
  next: GpuImageAnnotationPickResource,
): boolean {
  return (
    current.aAttribute === next.aAttribute &&
    current.bAttribute === next.bAttribute &&
    current.cAttribute === next.cAttribute &&
    current.kindAttribute === next.kindAttribute &&
    current.orderAttribute === next.orderAttribute &&
    current.primitiveIndexAttribute === next.primitiveIndexAttribute &&
    current.radiusAttribute === next.radiusAttribute
  );
}

function validPickRequest(
  request: GpuImageAnnotationPickRequest,
  imageWidth: number,
  imageHeight: number,
): boolean {
  return (
    imageWidth > 0 &&
    imageHeight > 0 &&
    Number.isFinite(request.radiusPx) &&
    request.radiusPx > 0 &&
    Number.isFinite(request.targetU) &&
    Number.isFinite(request.targetV) &&
    request.targetU >= 0 &&
    request.targetV >= 0 &&
    request.targetU < imageWidth &&
    request.targetV < imageHeight
  );
}

export default GpuImageAnnotationPicker;
