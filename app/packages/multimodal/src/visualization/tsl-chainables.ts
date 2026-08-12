import type * as THREE from "three";
import type * as TSL from "three/tsl";

/** Chainable node operations used by visible image-annotation shaders. */
export interface ImageAnnotationNode extends TSL.Node {
  readonly w: ImageAnnotationNode;
  readonly x: ImageAnnotationNode;
  readonly y: ImageAnnotationNode;
  readonly z: ImageAnnotationNode;
  abs(): ImageAnnotationNode;
  add(value: ImageAnnotationNode | number): ImageAnnotationNode;
  atan(value: ImageAnnotationNode): ImageAnnotationNode;
  div(value: ImageAnnotationNode | number): ImageAnnotationNode;
  greaterThan(value: ImageAnnotationNode | number): ImageAnnotationNode;
  length(): ImageAnnotationNode;
  max(value: ImageAnnotationNode | number): ImageAnnotationNode;
  mul(value: ImageAnnotationNode | number): ImageAnnotationNode;
  sub(value: ImageAnnotationNode | number): ImageAnnotationNode;
}

/** Mutable annotation uniform retaining its typed JavaScript value. */
export interface ImageAnnotationUniformNode<T> extends ImageAnnotationNode {
  value: T;
}

/** TSL namespace subset used by visible image annotations. */
export interface ImageAnnotationTslFacade {
  Discard(condition: ImageAnnotationNode): void;
  Fn(callback: () => ImageAnnotationNode): () => ImageAnnotationNode;
  and(...conditions: readonly ImageAnnotationNode[]): ImageAnnotationNode;
  greaterThan(
    left: ImageAnnotationNode,
    right: ImageAnnotationNode | number,
  ): ImageAnnotationNode;
  lessThan(
    left: ImageAnnotationNode,
    right: ImageAnnotationNode | number,
  ): ImageAnnotationNode;
  or(...conditions: readonly ImageAnnotationNode[]): ImageAnnotationNode;
  select(
    condition: ImageAnnotationNode,
    whenTrue: ImageAnnotationNode,
    whenFalse: ImageAnnotationNode,
  ): ImageAnnotationNode;
  uniform<T extends THREE.Vector2 | THREE.Vector4>(
    value: T,
  ): ImageAnnotationUniformNode<T>;
  uv(): ImageAnnotationNode;
  vec2(
    ...values: readonly (ImageAnnotationNode | number)[]
  ): ImageAnnotationNode;
  vec3(
    ...values: readonly (ImageAnnotationNode | number)[]
  ): ImageAnnotationNode;
  vec4(
    ...values: readonly (ImageAnnotationNode | number)[]
  ): ImageAnnotationNode;
  readonly viewportUV: ImageAnnotationNode;
}

/** Chainable node operations used by image-annotation integer picking. */
export interface ImageAnnotationPickNode extends TSL.Node {
  readonly x: ImageAnnotationPickNode;
  readonly y: ImageAnnotationPickNode;
  abs(): ImageAnnotationPickNode;
  add(value: ImageAnnotationPickNode | number): ImageAnnotationPickNode;
  div(value: ImageAnnotationPickNode | number): ImageAnnotationPickNode;
  length(): ImageAnnotationPickNode;
  max(value: ImageAnnotationPickNode | number): ImageAnnotationPickNode;
  min(value: ImageAnnotationPickNode | number): ImageAnnotationPickNode;
  mul(value: ImageAnnotationPickNode | number): ImageAnnotationPickNode;
  sub(value: ImageAnnotationPickNode | number): ImageAnnotationPickNode;
}

/** Mutable annotation-pick uniform retaining its typed JavaScript value. */
export interface ImageAnnotationPickUniformNode<
  T,
> extends ImageAnnotationPickNode {
  value: T;
}

/** TSL namespace subset used by image-annotation integer picking. */
export interface ImageAnnotationPickTslFacade {
  and(
    ...conditions: readonly ImageAnnotationPickNode[]
  ): ImageAnnotationPickNode;
  clamp(
    value: ImageAnnotationPickNode,
    min: number,
    max: number,
  ): ImageAnnotationPickNode;
  dot(
    left: ImageAnnotationPickNode,
    right: ImageAnnotationPickNode,
  ): ImageAnnotationPickNode;
  float(value: ImageAnnotationPickNode | number): ImageAnnotationPickNode;
  greaterThan(
    left: ImageAnnotationPickNode,
    right: ImageAnnotationPickNode | number,
  ): ImageAnnotationPickNode;
  readonly instanceIndex: ImageAnnotationPickNode;
  lessThan(
    left: ImageAnnotationPickNode,
    right: ImageAnnotationPickNode | number,
  ): ImageAnnotationPickNode;
  lessThanEqual(
    left: ImageAnnotationPickNode,
    right: ImageAnnotationPickNode | number,
  ): ImageAnnotationPickNode;
  not(condition: ImageAnnotationPickNode): ImageAnnotationPickNode;
  or(
    ...conditions: readonly ImageAnnotationPickNode[]
  ): ImageAnnotationPickNode;
  select(
    condition: ImageAnnotationPickNode,
    whenTrue: ImageAnnotationPickNode,
    whenFalse: ImageAnnotationPickNode,
  ): ImageAnnotationPickNode;
  uint(value: ImageAnnotationPickNode | number): ImageAnnotationPickNode;
  uniform<T extends number | THREE.Vector2>(
    value: T,
  ): ImageAnnotationPickUniformNode<T>;
  uvec4(
    ...values: readonly (ImageAnnotationPickNode | number)[]
  ): ImageAnnotationPickNode;
  vec2(
    ...values: readonly (ImageAnnotationPickNode | number)[]
  ): ImageAnnotationPickNode;
  vec3(
    ...values: readonly (ImageAnnotationPickNode | number)[]
  ): ImageAnnotationPickNode;
}

/** Chainable node operations used by camera-model projection. */
export interface CameraProjectionNode extends TSL.Node {
  readonly w: CameraProjectionNode;
  readonly x: CameraProjectionNode;
  readonly y: CameraProjectionNode;
  readonly z: CameraProjectionNode;
  add(value: TSL.Node | number): CameraProjectionNode;
  div(value: TSL.Node | number): CameraProjectionNode;
  mul(value: TSL.Node | number): CameraProjectionNode;
  sub(value: TSL.Node | number): CameraProjectionNode;
}

/** Mutable camera uniform retaining its typed JavaScript value. */
export interface CameraProjectionUniformNode<T> extends CameraProjectionNode {
  value: T;
}

/** TSL namespace subset used by camera-model projection. */
export interface CameraProjectionTslFacade {
  abs(value: CameraProjectionNode): CameraProjectionNode;
  and(...conditions: readonly CameraProjectionNode[]): CameraProjectionNode;
  atan(y: CameraProjectionNode, x: CameraProjectionNode): CameraProjectionNode;
  greaterThan(
    left: CameraProjectionNode,
    right: CameraProjectionNode | number,
  ): CameraProjectionNode;
  lessThanEqual(
    left: CameraProjectionNode,
    right: CameraProjectionNode | number,
  ): CameraProjectionNode;
  select(
    condition: CameraProjectionNode,
    whenTrue: CameraProjectionNode | number,
    whenFalse: CameraProjectionNode | number,
  ): CameraProjectionNode;
  sqrt(value: CameraProjectionNode): CameraProjectionNode;
  uniform<T extends number | THREE.Matrix4 | THREE.Vector4>(
    value: T,
  ): CameraProjectionUniformNode<T>;
  vec4(
    ...values: readonly (CameraProjectionNode | number)[]
  ): CameraProjectionNode;
}

/** Chainable node operations used by visible point-cloud projection. */
export interface PointCloudProjectionNode extends TSL.Node {
  readonly w: PointCloudProjectionNode;
  readonly x: PointCloudProjectionNode;
  readonly y: PointCloudProjectionNode;
  readonly z: PointCloudProjectionNode;
  div(value: PointCloudProjectionNode | number): PointCloudProjectionNode;
  greaterThan(
    value: PointCloudProjectionNode | number,
  ): PointCloudProjectionNode;
  length(): PointCloudProjectionNode;
  mul(value: PointCloudProjectionNode | number): PointCloudProjectionNode;
  sub(value: PointCloudProjectionNode | number): PointCloudProjectionNode;
}

/** Mutable visible-projection uniform retaining its typed JavaScript value. */
export interface PointCloudProjectionUniformNode<
  T,
> extends PointCloudProjectionNode {
  value: T;
}

/** TSL namespace subset used by visible point-cloud projection. */
export interface PointCloudProjectionTslFacade {
  Discard(condition: TSL.Node): void;
  Fn(callback: () => PointCloudProjectionNode): () => PointCloudProjectionNode;
  and(...conditions: readonly TSL.Node[]): PointCloudProjectionNode;
  greaterThan(
    left: TSL.Node,
    right: TSL.Node | number,
  ): PointCloudProjectionNode;
  greaterThanEqual(
    left: TSL.Node,
    right: TSL.Node | number,
  ): PointCloudProjectionNode;
  lessThan(left: TSL.Node, right: TSL.Node | number): PointCloudProjectionNode;
  or(...conditions: readonly TSL.Node[]): PointCloudProjectionNode;
  select(
    condition: TSL.Node,
    whenTrue: TSL.Node,
    whenFalse: TSL.Node,
  ): PointCloudProjectionNode;
  uniform<T extends THREE.Matrix4 | THREE.Vector2 | THREE.Vector4>(
    value: T,
  ): PointCloudProjectionUniformNode<T>;
  uv(): PointCloudProjectionNode;
  vec2(...values: readonly (TSL.Node | number)[]): PointCloudProjectionNode;
  vec3(...values: readonly (TSL.Node | number)[]): PointCloudProjectionNode;
  vec4(...values: readonly (TSL.Node | number)[]): PointCloudProjectionNode;
  readonly viewportUV: PointCloudProjectionNode;
}

/** Chainable node operations used by projected point-cloud picking. */
export interface PointCloudProjectionPickNode extends TSL.Node {
  readonly w: PointCloudProjectionPickNode;
  readonly x: PointCloudProjectionPickNode;
  readonly y: PointCloudProjectionPickNode;
  readonly z: PointCloudProjectionPickNode;
  add(
    value: PointCloudProjectionPickNode | number,
  ): PointCloudProjectionPickNode;
  div(
    value: PointCloudProjectionPickNode | number,
  ): PointCloudProjectionPickNode;
  mul(
    value: PointCloudProjectionPickNode | number,
  ): PointCloudProjectionPickNode;
  sub(
    value: PointCloudProjectionPickNode | number,
  ): PointCloudProjectionPickNode;
}

/** Mutable projected-pick uniform retaining its typed JavaScript value. */
export interface PointCloudProjectionPickUniformNode<
  T,
> extends PointCloudProjectionPickNode {
  value: T;
}

/** TSL namespace subset used by projected point-cloud picking. */
export interface PointCloudProjectionPickTslFacade {
  and(...conditions: readonly TSL.Node[]): PointCloudProjectionPickNode;
  clamp(
    value: TSL.Node,
    min: number,
    max: number,
  ): PointCloudProjectionPickNode;
  greaterThan(
    left: TSL.Node,
    right: TSL.Node | number,
  ): PointCloudProjectionPickNode;
  greaterThanEqual(
    left: TSL.Node,
    right: TSL.Node | number,
  ): PointCloudProjectionPickNode;
  readonly instanceIndex: PointCloudProjectionPickNode;
  lessThan(
    left: TSL.Node,
    right: TSL.Node | number,
  ): PointCloudProjectionPickNode;
  lessThanEqual(
    left: TSL.Node,
    right: TSL.Node | number,
  ): PointCloudProjectionPickNode;
  select(
    condition: TSL.Node,
    whenTrue: TSL.Node,
    whenFalse: TSL.Node,
  ): PointCloudProjectionPickNode;
  uint(value: TSL.Node | number): PointCloudProjectionPickNode;
  uniform<T extends number | THREE.Matrix4 | THREE.Vector2>(
    value: T,
  ): PointCloudProjectionPickUniformNode<T>;
  uvec4(
    ...values: readonly (TSL.Node | number)[]
  ): PointCloudProjectionPickNode;
  vec2(...values: readonly (TSL.Node | number)[]): PointCloudProjectionPickNode;
  vec3(...values: readonly (TSL.Node | number)[]): PointCloudProjectionPickNode;
  vec4(...values: readonly (TSL.Node | number)[]): PointCloudProjectionPickNode;
}

/** Chainable node operations used by 3D point-cloud picking. */
export interface PointCloud3dPickNode extends TSL.Node {
  readonly w: PointCloud3dPickNode;
  readonly x: PointCloud3dPickNode;
  readonly xy: PointCloud3dPickNode;
  readonly xyz: PointCloud3dPickNode;
  readonly y: PointCloud3dPickNode;
  readonly z: PointCloud3dPickNode;
  add(value: TSL.Node | number): PointCloud3dPickNode;
  div(value: TSL.Node | number): PointCloud3dPickNode;
  dot(value: TSL.Node): PointCloud3dPickNode;
  mul(value: TSL.Node | number): PointCloud3dPickNode;
  sub(value: TSL.Node | number): PointCloud3dPickNode;
}

/** Mutable 3D-pick uniform retaining its typed JavaScript value. */
export interface PointCloud3dPickUniformNode<T> extends PointCloud3dPickNode {
  value: T;
}

/** TSL namespace subset used by 3D point-cloud picking. */
export interface PointCloud3dPickTslFacade {
  and(...conditions: readonly TSL.Node[]): PointCloud3dPickNode;
  clamp(value: TSL.Node, min: number, max: number): PointCloud3dPickNode;
  greaterThan(left: TSL.Node, right: TSL.Node | number): PointCloud3dPickNode;
  greaterThanEqual(
    left: TSL.Node,
    right: TSL.Node | number,
  ): PointCloud3dPickNode;
  lessThanEqual(left: TSL.Node, right: TSL.Node | number): PointCloud3dPickNode;
  select(
    condition: TSL.Node,
    whenTrue: TSL.Node,
    whenFalse: TSL.Node,
  ): PointCloud3dPickNode;
  uint(value: TSL.Node | number): PointCloud3dPickNode;
  uniform<T extends number | THREE.Matrix4 | THREE.Vector2 | THREE.Vector3>(
    value: T,
  ): PointCloud3dPickUniformNode<T>;
  uvec4(...values: readonly (TSL.Node | number)[]): PointCloud3dPickNode;
  vec2(...values: readonly (TSL.Node | number)[]): PointCloud3dPickNode;
  vec3(...values: readonly (TSL.Node | number)[]): PointCloud3dPickNode;
  vec4(...values: readonly (TSL.Node | number)[]): PointCloud3dPickNode;
}

/** Chainable node operations used by point-cloud color resolution. */
export interface PointCloudColorNode extends TSL.Node {
  add(value: PointCloudColorNode | number): PointCloudColorNode;
  div(value: PointCloudColorNode | number): PointCloudColorNode;
  mul(value: PointCloudColorNode | number): PointCloudColorNode;
  sub(value: PointCloudColorNode | number): PointCloudColorNode;
}

/** Vector/color result exposing shader swizzles used by color materials. */
export interface PointCloudColorVectorNode extends PointCloudColorNode {
  readonly rgb: PointCloudColorVectorNode;
  readonly x: PointCloudColorNode;
  readonly y: PointCloudColorNode;
  readonly z: PointCloudColorNode;
}

/** Mutable point-color uniform retaining its typed JavaScript value. */
export interface PointCloudColorUniformNode<T> extends PointCloudColorNode {
  value: T;
}

/** TSL namespace subset used by point-cloud color resolution. */
export interface PointCloudColorTslFacade {
  abs(value: TSL.Node): PointCloudColorNode;
  and(...conditions: readonly TSL.Node[]): PointCloudColorNode;
  clamp(
    value: TSL.Node,
    min: TSL.Node | number,
    max: TSL.Node | number,
  ): PointCloudColorNode;
  equal(left: TSL.Node, right: TSL.Node | number): PointCloudColorNode;
  lessThanEqual(left: TSL.Node, right: TSL.Node | number): PointCloudColorNode;
  select(
    condition: TSL.Node,
    whenTrue: TSL.Node,
    whenFalse: TSL.Node,
  ): PointCloudColorNode;
  texture(texture: THREE.Texture, uv: TSL.Node): PointCloudColorVectorNode;
  uniform<T extends number | THREE.Vector3>(
    value: T,
  ): PointCloudColorUniformNode<T>;
  vec2(...values: readonly (TSL.Node | number)[]): PointCloudColorNode;
  vec3(...values: readonly (TSL.Node | number)[]): PointCloudColorVectorNode;
}

/** Chainable position node shared by point-cloud draw and pick graphs. */
export interface PointCloudPositionNode extends TSL.Node {
  readonly w: PointCloudPositionNode;
  readonly x: PointCloudPositionNode;
  readonly xy: PointCloudPositionNode;
  readonly xyz: PointCloudPositionNode;
  readonly y: PointCloudPositionNode;
  readonly z: PointCloudPositionNode;
  add(value: TSL.Node | number): PointCloudPositionNode;
  div(value: TSL.Node | number): PointCloudPositionNode;
  dot(value: TSL.Node): PointCloudPositionNode;
  mod(value: TSL.Node | number): PointCloudPositionNode;
  mul(value: TSL.Node | number): PointCloudPositionNode;
  sub(value: TSL.Node | number): PointCloudPositionNode;
}

/** Storage binding used by point-cloud position graphs. */
export interface PointCloudPositionStorageNode {
  element(index: PointCloudPositionNode): PointCloudPositionNode;
  toReadOnly(): PointCloudPositionStorageNode;
}

/** TSL namespace subset used by point-cloud position storage. */
export interface PointCloudPositionTslFacade {
  readonly instanceIndex: PointCloudChannelNode;
  storage(
    attribute: THREE.BufferAttribute,
    type: "float" | "vec3",
    count: number,
  ): PointCloudPositionStorageNode;
  vec3(
    x: PointCloudPositionNode,
    y: PointCloudPositionNode,
    z: PointCloudPositionNode,
  ): PointCloudPositionNode;
}

/** Chainable operations for compact point-cloud channel decoding. */
export interface PointCloudChannelNode extends PointCloudPositionNode {
  add(value: TSL.Node | number): PointCloudChannelNode;
  bitAnd(value: TSL.Node | number): PointCloudChannelNode;
  div(value: TSL.Node | number): PointCloudChannelNode;
  equal(value: TSL.Node | number): PointCloudChannelNode;
  mod(value: TSL.Node | number): PointCloudChannelNode;
  mul(value: TSL.Node | number): PointCloudChannelNode;
  shiftLeft(value: TSL.Node | number): PointCloudChannelNode;
  shiftRight(value: TSL.Node | number): PointCloudChannelNode;
  sub(value: TSL.Node | number): PointCloudChannelNode;
}

/** Storage binding used by compact point-cloud channel graphs. */
export interface PointCloudChannelStorageNode {
  element(index: TSL.Node): PointCloudChannelNode;
  toReadOnly(): PointCloudChannelStorageNode;
}

/** TSL namespace subset used by compact point-cloud channel decoding. */
export interface PointCloudChannelTslFacade {
  float(value: PointCloudChannelNode | number): PointCloudChannelNode;
  int(value: PointCloudChannelNode | number): PointCloudChannelNode;
  select(
    condition: PointCloudChannelNode,
    whenTrue: PointCloudChannelNode,
    whenFalse: PointCloudChannelNode,
  ): PointCloudChannelNode;
  storage(
    attribute: THREE.BufferAttribute,
    type: "float" | "int" | "uint",
    count: number,
  ): PointCloudChannelStorageNode;
  uint(value: PointCloudChannelNode | number): PointCloudChannelNode;
  uintBitsToFloat(value: PointCloudChannelNode): PointCloudChannelNode;
  vec3(
    x: PointCloudChannelNode,
    y: PointCloudChannelNode,
    z: PointCloudChannelNode,
  ): PointCloudChannelNode & PointCloudColorVectorNode;
}

/** Chainable node operations used by the legacy point-sprite fragment. */
export interface PointCloudSpriteNode extends TSL.Node {
  greaterThan(value: number): PointCloudSpriteNode;
  length(): PointCloudSpriteNode;
  sub(value: number): PointCloudSpriteNode;
}

/** TSL namespace subset used by the legacy point-sprite fragment. */
export interface PointCloudSpriteTslFacade {
  Discard(condition: PointCloudSpriteNode): void;
  Fn(callback: () => TSL.Node): () => TSL.Node;
  uv(): PointCloudSpriteNode;
  vec4(color: TSL.Node, alpha: number): TSL.Node;
}
