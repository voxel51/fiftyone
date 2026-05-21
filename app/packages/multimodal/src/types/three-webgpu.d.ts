// Three ships a runtime `three/webgpu` entrypoint, but the installed
// `@types/three` package does not declare that subpath with the WebGPU renderer
// API used by our panels. Keep this shim intentionally narrow so it only covers
// the surface we import until the upstream types expose it.
declare module "three/webgpu" {
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
    setClearColor(
      color: import("three").ColorRepresentation,
      alpha?: number
    ): void;
  }
}
