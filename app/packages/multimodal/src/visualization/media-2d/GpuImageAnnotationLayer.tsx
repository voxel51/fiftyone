/* eslint-disable react/no-unknown-property */
import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import * as TSL from "three/tsl";
import { PointsNodeMaterial, SpriteNodeMaterial } from "three/webgpu";

import type { ImageViewTransform } from "./Base2dScene";
import {
  imagePlaneSize as fittedImagePlaneSize,
  imagePlaneViewportRect as fittedImagePlaneViewportRect,
} from "./image-plane-viewport";
import {
  retainGpuImageAnnotationResource,
  type GpuImageAnnotationPointResource,
  type GpuImageAnnotationResource,
  type GpuImageAnnotationSegmentResource,
} from "./gpu-image-annotation-resources";
import type {
  ImageAnnotationNode,
  ImageAnnotationTslFacade,
  ImageAnnotationUniformNode,
} from "../tsl-chainables";

const CULLED_POSITION = 1e9;
const ANNOTATION_Z = 0.2;
const DEFAULT_RENDER_ORDER = 20;
const NOOP_RAYCAST = () => undefined;

interface AnnotationNodeMaterial {
  blending: THREE.Blending;
  depthTest: boolean;
  depthWrite: boolean;
  fragmentNode: TSL.Node | null;
  positionNode: TSL.Node | null;
  rotationNode: ImageAnnotationNode | null;
  scaleNode: ImageAnnotationNode | null;
  sizeNode?: ImageAnnotationNode | null;
  toneMapped: boolean;
  transparent: boolean;
  dispose(): void;
}

const annotationTsl: ImageAnnotationTslFacade = TSL;

/** Inputs for the instanced point/circle and line-segment render passes. */
export interface GpuImageAnnotationLayerProps {
  readonly fit: "contain" | "cover";
  readonly imageHeight: number;
  readonly imageWidth: number;
  readonly renderOrder?: number;
  readonly resource: GpuImageAnnotationResource;
  readonly viewTransform?: ImageViewTransform;
}

/**
 * Two instanced draws render every visible 2D annotation: one sprite batch for
 * points/circles and one capsule batch for all line work.
 */
export function GpuImageAnnotationLayer({
  fit,
  imageHeight,
  imageWidth,
  renderOrder = DEFAULT_RENDER_ORDER,
  resource,
  viewTransform,
}: GpuImageAnnotationLayerProps) {
  const invalidate = useThree((state) => state.invalidate);
  const size = useThree((state) => state.size);
  const imagePlaneSize = useMemo(
    () =>
      fittedImagePlaneSize({
        containerHeight: size.height,
        containerWidth: size.width,
        fit,
        imageHeight,
        imageWidth,
      }),
    [fit, imageHeight, imageWidth, size.height, size.width],
  );
  const imageRect = useMemo(
    () =>
      fittedImagePlaneViewportRect({
        containerHeight: size.height,
        containerWidth: size.width,
        fit,
        imageHeight,
        imageWidth,
        viewTransform,
      }),
    [fit, imageHeight, imageWidth, size.height, size.width, viewTransform],
  );
  const pointShader = useMemo(
    () => createGpuImageAnnotationPointMaterial(resource.points),
    [resource.points],
  );
  const segmentShader = useMemo(
    () => createGpuImageAnnotationSegmentMaterial(resource.segments),
    [resource.segments],
  );
  const pointSprite = useMemo(
    () =>
      createSprite(pointShader.material, resource.points.geometry, renderOrder),
    [pointShader.material, renderOrder, resource.points.geometry],
  );
  const segmentSprite = useMemo(
    () =>
      createSprite(
        segmentShader.material,
        resource.segments.geometry,
        renderOrder,
      ),
    [renderOrder, resource.segments.geometry, segmentShader.material],
  );

  // This layout effect pins the backing attributes while scene objects use them.
  useLayoutEffect(() => retainGpuImageAnnotationResource(resource), [resource]);

  // This layout effect updates mutable uniforms and instance counts during pan,
  // zoom, resize, and playback without rebuilding the compiled material graph.
  useLayoutEffect(() => {
    const viewScale = Number.isFinite(viewTransform?.scale)
      ? Math.max(1e-6, viewTransform?.scale ?? 1)
      : 1;
    const pixelScaleX =
      imageWidth > 0
        ? (imagePlaneSize.width * viewScale) / imageWidth
        : imagePlaneSize.width;
    const pixelScaleY =
      imageHeight > 0
        ? (imagePlaneSize.height * viewScale) / imageHeight
        : imagePlaneSize.height;
    pointSprite.count = resource.points.count;
    segmentSprite.count = resource.segments.count;
    pointShader.dimensions.value.set(imageWidth, imageHeight);
    pointShader.imageRect.value.set(
      imageRect.left,
      imageRect.top,
      imageRect.right,
      imageRect.bottom,
    );
    pointShader.pixelScale.value.set(pixelScaleX, pixelScaleY);
    segmentShader.dimensions.value.set(imageWidth, imageHeight);
    segmentShader.imageRect.value.copy(pointShader.imageRect.value);
    segmentShader.pixelScale.value.copy(pointShader.pixelScale.value);
    invalidate();
  }, [
    imageHeight,
    imagePlaneSize.height,
    imagePlaneSize.width,
    imageRect.bottom,
    imageRect.left,
    imageRect.right,
    imageRect.top,
    imageWidth,
    invalidate,
    pointShader,
    pointSprite,
    resource,
    resource.revision,
    segmentShader,
    segmentSprite,
    viewTransform?.scale,
  ]);

  // This effect disposes replaced node materials after React commits them.
  useEffect(
    () => () => {
      pointShader.material.dispose();
      segmentShader.material.dispose();
    },
    [pointShader.material, segmentShader.material],
  );

  return (
    <>
      <primitive object={pointSprite} />
      <primitive object={segmentSprite} />
    </>
  );
}

/** Node material and mutable view uniforms for one annotation batch. */
export interface GpuImageAnnotationMaterial {
  readonly dimensions: ImageAnnotationUniformNode<THREE.Vector2>;
  readonly imageRect: ImageAnnotationUniformNode<THREE.Vector4>;
  readonly material: AnnotationNodeMaterial;
  readonly pixelScale: ImageAnnotationUniformNode<THREE.Vector2>;
}

/** Builds the procedural disc/ring material for batched points and circles. */
export function createGpuImageAnnotationPointMaterial(
  resource: GpuImageAnnotationPointResource,
): GpuImageAnnotationMaterial {
  const material = createPointMaterial();
  const dimensions = annotationTsl.uniform(new THREE.Vector2(1, 1));
  const imageRect = annotationTsl.uniform(new THREE.Vector4(0, 0, 1, 1));
  const pixelScale = annotationTsl.uniform(new THREE.Vector2(1, 1));
  const center = attribute(resource.centerAttribute, "vec2");
  const color = attribute(resource.colorAttribute, "vec3");
  const diameter = attribute(resource.diameterAttribute, "float");
  const kind = attribute(resource.kindAttribute, "float");
  const thickness = attribute(resource.thicknessAttribute, "float");
  const size = annotationTsl.vec2(
    diameter.mul(pixelScale.x),
    diameter.mul(pixelScale.y),
  );

  material.positionNode = annotationPosition(center, dimensions);
  material.sizeNode = size;
  material.fragmentNode = annotationTsl.Fn(() => {
    annotationTsl.Discard(outsideImage(imageRect));
    // Geometry follows the image scale; stroke thickness stays in CSS pixels.
    const pixelOffset = annotationTsl.uv().sub(0.5).mul(size).abs();
    const distance = pixelOffset.length();
    const radius = diameter.mul(pixelScale.x).mul(0.5);
    annotationTsl.Discard(distance.greaterThan(radius));
    const insideRing = annotationTsl.and(
      kind.greaterThan(0.5),
      annotationTsl.lessThan(distance, radius.sub(thickness).max(0)),
    );
    annotationTsl.Discard(insideRing);
    return annotationTsl.vec4(color, 1);
  })();

  return { dimensions, imageRect, material, pixelScale };
}

/** Builds the scale-then-rotate capsule material for batched line segments. */
export function createGpuImageAnnotationSegmentMaterial(
  resource: GpuImageAnnotationSegmentResource,
): GpuImageAnnotationMaterial {
  const material = createSegmentMaterial();
  const dimensions = annotationTsl.uniform(new THREE.Vector2(1, 1));
  const imageRect = annotationTsl.uniform(new THREE.Vector4(0, 0, 1, 1));
  const pixelScale = annotationTsl.uniform(new THREE.Vector2(1, 1));
  const color = attribute(resource.colorAttribute, "vec3");
  const end = attribute(resource.endAttribute, "vec2");
  const start = attribute(resource.startAttribute, "vec2");
  const thickness = attribute(resource.thicknessAttribute, "float");
  const delta = end.sub(start);
  const screenDelta = annotationTsl.vec2(
    delta.x.mul(pixelScale.x),
    delta.y.mul(pixelScale.y),
  );
  const length = screenDelta.length();
  // Segment length follows the image scale; stroke thickness stays in CSS
  // pixels to preserve the old non-scaling SVG stroke behavior.
  const spriteSize = annotationTsl.vec2(length.add(thickness), thickness);

  material.positionNode = annotationPosition(
    start.add(end).mul(0.5),
    dimensions,
  );
  material.rotationNode = screenDelta.y.mul(-1).atan(screenDelta.x);
  // PointsNodeMaterial rotates its unit quad before applying non-uniform point
  // size, which shears every non-horizontal line. SpriteNodeMaterial scales in
  // image-local space first and rotates the resulting rectangle afterwards.
  // Divide the requested screen size by the parent image-plane scale because
  // SpriteNodeMaterial will multiply it back through modelWorldMatrix.
  material.scaleNode = annotationTsl.vec2(
    spriteSize.x.div(dimensions.x.mul(pixelScale.x).max(1e-6)),
    spriteSize.y.div(dimensions.y.mul(pixelScale.y).max(1e-6)),
  );
  material.fragmentNode = annotationTsl.Fn(() => {
    annotationTsl.Discard(outsideImage(imageRect));
    const pixelOffset = annotationTsl.uv().sub(0.5).mul(spriteSize).abs();
    const capOffset = pixelOffset.x.sub(length.mul(0.5)).max(0);
    const distance = annotationTsl.vec2(capOffset, pixelOffset.y).length();
    annotationTsl.Discard(distance.greaterThan(thickness.mul(0.5)));
    return annotationTsl.vec4(color, 1);
  })();

  return { dimensions, imageRect, material, pixelScale };
}

function createPointMaterial(): AnnotationNodeMaterial {
  const material = new PointsNodeMaterial({
    size: 1,
    sizeAttenuation: false,
  }) as unknown as AnnotationNodeMaterial;
  configureMaterial(material);
  return material;
}

function createSegmentMaterial(): AnnotationNodeMaterial {
  const material =
    new SpriteNodeMaterial() as unknown as AnnotationNodeMaterial;
  configureMaterial(material);
  return material;
}

function configureMaterial(material: AnnotationNodeMaterial): void {
  material.blending = THREE.NormalBlending;
  material.depthTest = false;
  material.depthWrite = false;
  material.toneMapped = false;
  material.transparent = true;
}

function annotationPosition(
  point: ImageAnnotationNode,
  dimensions: ImageAnnotationNode,
): ImageAnnotationNode {
  const valid = annotationTsl.and(
    annotationTsl.greaterThan(dimensions.x, 0),
    annotationTsl.greaterThan(dimensions.y, 0),
  );
  return annotationTsl.select(
    valid,
    annotationTsl.vec3(
      point.x.div(dimensions.x).sub(0.5),
      point.y.div(dimensions.y).sub(0.5).mul(-1),
      ANNOTATION_Z,
    ),
    annotationTsl.vec3(CULLED_POSITION, CULLED_POSITION, ANNOTATION_Z),
  );
}

function outsideImage(imageRect: ImageAnnotationNode): ImageAnnotationNode {
  return annotationTsl.or(
    annotationTsl.lessThan(annotationTsl.viewportUV.x, imageRect.x),
    annotationTsl.lessThan(annotationTsl.viewportUV.y, imageRect.y),
    annotationTsl.greaterThan(annotationTsl.viewportUV.x, imageRect.z),
    annotationTsl.greaterThan(annotationTsl.viewportUV.y, imageRect.w),
  );
}

function attribute(
  value: THREE.InstancedBufferAttribute,
  type: "float" | "vec2" | "vec3",
): ImageAnnotationNode {
  return TSL.instancedBufferAttribute<ImageAnnotationNode>(value, type);
}

function createSprite(
  material: AnnotationNodeMaterial,
  geometry: THREE.PlaneGeometry,
  renderOrder: number,
): THREE.Sprite {
  const sprite = new THREE.Sprite(material as unknown as THREE.SpriteMaterial);
  sprite.count = 0;
  sprite.geometry = geometry;
  sprite.frustumCulled = false;
  sprite.raycast = NOOP_RAYCAST;
  sprite.renderOrder = renderOrder;
  return sprite;
}

export default GpuImageAnnotationLayer;
