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
