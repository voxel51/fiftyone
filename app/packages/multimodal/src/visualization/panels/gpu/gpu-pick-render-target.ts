import * as THREE from "three";

import type { GpuPickReadbackLease } from "./gpu-pick-readback-pool";

const PICK_TARGET_SIZE = 1;

/** Renderer surface needed by the shared integer pick pass. */
export interface GpuPickRenderer {
  autoClear: boolean;
  autoClearColor: boolean;
  autoClearDepth: boolean;
  autoClearStencil: boolean;
  readonly isWebGPURenderer: true;
  getClearAlpha(): number;
  getClearColor(target: THREE.Color): THREE.Color;
  getMRT(): unknown;
  getRenderTarget(): THREE.RenderTarget | null;
  readRenderTargetPixelsAsync(
    renderTarget: THREE.RenderTarget,
    x: number,
    y: number,
    width: number,
    height: number,
  ): Promise<ArrayBufferView>;
  render(scene: THREE.Object3D, camera: THREE.Camera): void;
  setClearColor(color: THREE.ColorRepresentation, alpha?: number): void;
  setMRT(mrt: unknown): void;
  setRenderTarget(renderTarget: THREE.RenderTarget | null): void;
}

/** One reusable 1x1 integer target with renderer-state preservation. */
export class GpuPickRenderTarget {
  private readonly clearColor = new THREE.Color();
  private readonly target = new THREE.RenderTarget(
    PICK_TARGET_SIZE,
    PICK_TARGET_SIZE,
    {
      depthBuffer: true,
      format: THREE.RGBAIntegerFormat,
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
      samples: 0,
      stencilBuffer: false,
      type: THREE.UnsignedIntType,
    },
  );

  constructor(private readonly renderer: GpuPickRenderer) {}

  dispose(): void {
    this.target.dispose();
  }

  renderAndRead(
    scene: THREE.Scene,
    camera: THREE.Camera,
    readback: GpuPickReadbackLease,
  ): Promise<ArrayBufferView> {
    const renderer = this.renderer;
    const previousRenderTarget = renderer.getRenderTarget();
    const previousMrt = renderer.getMRT();
    const previousClearColor = renderer.getClearColor(this.clearColor);
    const previousClearAlpha = renderer.getClearAlpha();
    const previousAutoClear = renderer.autoClear;
    const previousAutoClearColor = renderer.autoClearColor;
    const previousAutoClearDepth = renderer.autoClearDepth;
    const previousAutoClearStencil = renderer.autoClearStencil;

    try {
      renderer.setRenderTarget(this.target);
      renderer.setMRT(null);
      renderer.setClearColor(0, 0);
      renderer.autoClear = true;
      renderer.autoClearColor = true;
      renderer.autoClearDepth = true;
      renderer.autoClearStencil = false;
      renderer.render(scene, camera);
      return readback.read(this.target);
    } finally {
      renderer.setRenderTarget(previousRenderTarget);
      renderer.setMRT(previousMrt);
      renderer.setClearColor(previousClearColor, previousClearAlpha);
      renderer.autoClear = previousAutoClear;
      renderer.autoClearColor = previousAutoClearColor;
      renderer.autoClearDepth = previousAutoClearDepth;
      renderer.autoClearStencil = previousAutoClearStencil;
    }
  }
}

/** Returns whether a renderer exposes the WebGPU state required for picking. */
export function isGpuPickRenderer(
  renderer: unknown,
): renderer is GpuPickRenderer {
  if (!renderer || typeof renderer !== "object") {
    return false;
  }
  const candidate = renderer as Partial<GpuPickRenderer>;
  return (
    candidate.isWebGPURenderer === true &&
    typeof candidate.getClearAlpha === "function" &&
    typeof candidate.getClearColor === "function" &&
    typeof candidate.getMRT === "function" &&
    typeof candidate.getRenderTarget === "function" &&
    typeof candidate.readRenderTargetPixelsAsync === "function" &&
    typeof candidate.render === "function" &&
    typeof candidate.setClearColor === "function" &&
    typeof candidate.setMRT === "function" &&
    typeof candidate.setRenderTarget === "function"
  );
}
