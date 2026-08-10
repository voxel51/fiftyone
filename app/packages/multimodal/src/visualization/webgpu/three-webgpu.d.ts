// Three ships runtime `three/webgpu` and `three/tsl` entrypoints, but the
// installed `@types/three` package does not declare those subpaths with the
// WebGPU renderer / TSL node API used by our panels. Keep this shim
// intentionally narrow so it only covers the surface we import until the
// upstream types expose it.
declare module "three/webgpu" {
  import type {
    MeshBasicMaterial,
    PointsMaterial,
    SpriteMaterial,
  } from "three";
  import type { Node } from "three/tsl";

  export * from "three";

  /**
   * Minimal WebGPU renderer surface consumed by the multimodal panels.
   */
  export class WebGPURenderer {
    readonly isWebGPURenderer: true;
    outputColorSpace: import("three").ColorSpace;

    constructor(parameters?: import("three").WebGLRendererParameters);

    dispose(): void;
    getMaxAnisotropy?(): number;
    init(): Promise<void>;
    renderAsync(
      scene: import("three").Object3D,
      camera: import("three").Camera,
    ): Promise<void>;
    setClearColor(
      color: import("three").ColorRepresentation,
      alpha?: number,
    ): void;
  }

  /**
   * Minimal node-material surface consumed by the multimodal panels:
   * a MeshBasicMaterial whose vertex position and opacity can be driven
   * by TSL node graphs.
   */
  export class MeshBasicNodeMaterial extends MeshBasicMaterial {
    colorNode: Node | null;
    opacityNode: Node | null;
    positionNode: Node | null;
  }

  /** Minimal node-material surface for scale-then-rotate instanced sprites. */
  export class SpriteNodeMaterial extends SpriteMaterial {
    positionNode: Node | null;
    rotationNode: Node | null;
    scaleNode: Node | null;
  }

  /**
   * Minimal node-material surface consumed by sized point-cloud sprites.
   * The runtime class extends SpriteNodeMaterial, but it intentionally
   * mirrors PointsMaterial's size controls.
   */
  export class PointsNodeMaterial extends PointsMaterial {
    colorNode: Node | null;
    positionNode: Node | null;
    sizeNode: Node | null;
  }
}

declare module "three/tsl" {
  /**
   * Minimal chainable TSL shader-node surface consumed by the multimodal
   * panels. TSL nodes are proxy-based and effectively untyped upstream for
   * this @types version; this models only the operators and swizzles we use.
   */
  export interface Node {
    readonly x: Node;
    readonly y: Node;
    readonly z: Node;
    readonly xy: Node;
    add(value: Node | number): Node;
    div(value: Node | number): Node;
    max(value: Node | number): Node;
    mul(value: Node | number): Node;
    sub(value: Node | number): Node;
  }

  /** Runtime node shape exposed by the built-in instance index. */
  export interface InstanceIndexNode extends Node {
    readonly w: InstanceIndexNode;
    readonly x: InstanceIndexNode;
    readonly xy: InstanceIndexNode;
    readonly xyz: InstanceIndexNode;
    readonly y: InstanceIndexNode;
    readonly z: InstanceIndexNode;
    abs(): InstanceIndexNode;
    add(value: Node | number): InstanceIndexNode;
    bitAnd(value: Node | number): InstanceIndexNode;
    div(value: Node | number): InstanceIndexNode;
    dot(value: Node): InstanceIndexNode;
    equal(value: Node | number): InstanceIndexNode;
    mod(value: Node | number): InstanceIndexNode;
    mul(value: Node | number): InstanceIndexNode;
    length(): InstanceIndexNode;
    max(value: Node | number): InstanceIndexNode;
    min(value: Node | number): InstanceIndexNode;
    shiftLeft(value: Node | number): InstanceIndexNode;
    shiftRight(value: Node | number): InstanceIndexNode;
    sub(value: Node | number): InstanceIndexNode;
  }

  /** Runtime node shape exposed by viewport coordinates. */
  export interface ViewportNode extends Node {
    readonly w: ViewportNode;
    readonly x: ViewportNode;
    readonly y: ViewportNode;
    readonly z: ViewportNode;
    abs(): ViewportNode;
    add(value: Node | number): ViewportNode;
    atan(value: Node): ViewportNode;
    div(value: Node | number): ViewportNode;
    greaterThan(value: Node | number): ViewportNode;
    length(): ViewportNode;
    max(value: Node | number): ViewportNode;
    min(value: Node | number): ViewportNode;
    mul(value: Node | number): ViewportNode;
    sub(value: Node | number): ViewportNode;
  }

  /** Chainable storage binding returned by TSL storage accessors. */
  export interface StorageNode<NodeType extends Node = Node> {
    element(index: Node): NodeType;
    toReadOnly(): StorageNode<NodeType>;
  }

  export const cameraPosition: Node;
  export const instanceIndex: InstanceIndexNode;
  export const positionGeometry: Node;
  export const positionWorld: Node;
  export const screenUV: Node;
  export const viewportUV: ViewportNode;

  export function instancedBufferAttribute<NodeType extends Node = Node>(
    array:
      | import("three").BufferAttribute
      | import("three").InterleavedBuffer
      | ArrayLike<number>,
    type?: string | null,
    stride?: number,
    offset?: number,
  ): NodeType;

  export function Discard(condition: Node): void;
  export function Fn<NodeType extends Node>(
    callback: () => NodeType,
  ): () => NodeType;
  export function abs<NodeType extends Node = Node>(
    value: Node | number,
  ): NodeType;
  export function and<NodeType extends Node = Node>(
    ...conditions: readonly Node[]
  ): NodeType;
  export function atan<NodeType extends Node = Node>(
    y: Node,
    x?: Node,
  ): NodeType;
  export function clamp<NodeType extends Node = Node>(
    value: Node | number,
    min: Node | number,
    max: Node | number,
  ): NodeType;
  export function colorSpaceToWorking<NodeType extends Node = Node>(
    value: Node,
    colorSpace: import("three").ColorSpace,
  ): NodeType;
  export function dot<NodeType extends Node = Node>(
    left: Node,
    right: Node,
  ): NodeType;
  export function equal<NodeType extends Node = Node>(
    left: Node,
    right: Node | number,
  ): NodeType;
  export function float<NodeType extends Node = Node>(
    value: Node | number,
  ): NodeType;
  export function floor(value: Node | number): Node;
  export function fract(value: Node | number): Node;
  export function fwidth(value: Node | number): Node;
  export function greaterThan<NodeType extends Node = Node>(
    left: Node,
    right: Node | number,
  ): NodeType;
  export function greaterThanEqual<NodeType extends Node = Node>(
    left: Node,
    right: Node | number,
  ): NodeType;
  export function int<NodeType extends Node = Node>(
    value: Node | number,
  ): NodeType;
  export function ivec2<NodeType extends Node = Node>(
    ...values: readonly (Node | number)[]
  ): NodeType;
  export function lessThan<NodeType extends Node = Node>(
    left: Node,
    right: Node | number,
  ): NodeType;
  export function lessThanEqual<NodeType extends Node = Node>(
    left: Node,
    right: Node | number,
  ): NodeType;
  export function log2(value: Node | number): Node;
  export function max(a: Node | number, b: Node | number): Node;
  export function mix(
    a: Node | number,
    b: Node | number,
    t: Node | number,
  ): Node;
  export function not<NodeType extends Node = Node>(condition: Node): NodeType;
  export function or<NodeType extends Node = Node>(
    ...conditions: readonly Node[]
  ): NodeType;
  export function pow(a: Node | number, b: Node | number): Node;
  export function select<NodeType extends Node = Node>(
    condition: Node,
    whenTrue: Node | number,
    whenFalse: Node | number,
  ): NodeType;
  export function sqrt<NodeType extends Node = Node>(value: Node): NodeType;
  export function storage<NodeType extends Node = Node>(
    attribute: import("three").BufferAttribute,
    type: "float" | "int" | "uint" | "vec3",
    count: number,
  ): StorageNode<NodeType>;
  export function texture<NodeType extends Node = Node>(
    texture: import("three").Texture,
    uv: Node,
  ): NodeType;
  export function textureLoad<NodeType extends Node = Node>(
    texture: import("three").Texture,
    coordinates: Node,
  ): NodeType;
  export function uint<NodeType extends Node = Node>(
    value: Node | number,
  ): NodeType;
  export function uintBitsToFloat<NodeType extends Node = Node>(
    value: Node,
  ): NodeType;
  export function uniform<T, NodeType extends Node = Node>(
    value: T,
  ): NodeType & { value: T };
  export function uv<NodeType extends Node = Node>(): NodeType;
  export function uvec4<NodeType extends Node = Node>(
    ...values: readonly (Node | number)[]
  ): NodeType;
  export function vec2<NodeType extends Node = Node>(
    ...values: readonly (Node | number)[]
  ): NodeType;
  export function vec3<NodeType extends Node = Node>(
    ...values: readonly (Node | number)[]
  ): NodeType;
  export function vec4<NodeType extends Node = Node>(
    ...values: readonly (Node | number)[]
  ): NodeType;
}
