// Three ships runtime `three/webgpu` and `three/tsl` entrypoints, but the
// installed `@types/three` package does not declare those subpaths with the
// WebGPU renderer / TSL node API used by our panels. Keep this shim
// intentionally narrow so it only covers the surface we import until the
// upstream types expose it.
declare module "three/webgpu" {
  import type { MeshBasicMaterial } from "three";
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
    opacityNode: Node | null;
    positionNode: Node | null;
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

  export const cameraPosition: Node;
  export const positionGeometry: Node;
  export const positionWorld: Node;
  export const screenUV: Node;

  export function abs(value: Node | number): Node;
  export function clamp(
    value: Node | number,
    min: Node | number,
    max: Node | number,
  ): Node;
  export function float(value: Node | number): Node;
  export function floor(value: Node | number): Node;
  export function fract(value: Node | number): Node;
  export function fwidth(value: Node | number): Node;
  export function log2(value: Node | number): Node;
  export function max(a: Node | number, b: Node | number): Node;
  export function mix(
    a: Node | number,
    b: Node | number,
    t: Node | number,
  ): Node;
  export function pow(a: Node | number, b: Node | number): Node;
  export function vec2(...values: readonly (Node | number)[]): Node;
  export function vec3(...values: readonly (Node | number)[]): Node;
}
