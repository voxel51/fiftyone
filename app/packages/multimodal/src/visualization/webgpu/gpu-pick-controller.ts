import * as THREE from "three";

import {
  acquireGpuPickReadbackPool,
  type GpuPickReadbackLease,
} from "./gpu-pick-readback-pool";
import {
  GpuPickRenderTarget,
  type GpuPickRenderer,
} from "./gpu-pick-render-target";

/** Domain-owned render pass used by the shared GPU picker lifecycle. */
export interface GpuPickPass<Scene, Request> {
  readonly dispose: () => void;
  /** Validates one request and freezes its uniforms for submission. */
  readonly preparePick: (request: Request) => boolean;
  readonly scene: THREE.Scene;
  /** Returns false when shader-bound storage changed and needs rebuilding. */
  readonly updateScene: (scene: Scene) => boolean;
}

/** Lifecycle shared by integer GPU pick controllers. */
export interface GpuPickController<Scene, Request, Result> {
  dispose(): void;
  invalidate(): void;
  pick(request: Request): Promise<Result | null>;
  setScene(scene: Scene): void;
}

interface GpuPickControllerOptions<
  Scene,
  Request,
  Result,
  Pass extends GpuPickPass<Scene, Request>,
> {
  readonly createPass: (scene: Scene) => Pass;
  readonly decodeTexel: (pixels: Uint32Array, pass: Pass) => Result | null;
  readonly invalidTexelMessage: string;
  readonly minimumTexelLength: number;
}

/**
 * Creates one controller shell around a domain-owned GPU pick pass.
 *
 * Domain modules retain request validation, pass construction, and result
 * decoding. This shell owns invalidation, stale-result suppression, pass
 * replacement, readback failure filtering, and disposal order.
 */
export function createGpuPickController<
  Scene,
  Request,
  Result,
  Pass extends GpuPickPass<Scene, Request>,
>(
  renderer: GpuPickRenderer,
  options: GpuPickControllerOptions<Scene, Request, Result, Pass>,
): GpuPickController<Scene, Request, Result> {
  return new SharedGpuPickController(renderer, options);
}

class SharedGpuPickController<
  Scene,
  Request,
  Result,
  Pass extends GpuPickPass<Scene, Request>,
> implements GpuPickController<Scene, Request, Result> {
  private disposed = false;
  private generation = 0;
  private readonly readback: GpuPickReadbackLease;
  private renderPass: Pass | null = null;
  private readonly target: GpuPickRenderTarget;

  constructor(
    renderer: GpuPickRenderer,
    private readonly options: GpuPickControllerOptions<
      Scene,
      Request,
      Result,
      Pass
    >,
  ) {
    this.readback = acquireGpuPickReadbackPool(renderer);
    this.target = new GpuPickRenderTarget(renderer);
  }

  setScene(scene: Scene): void {
    if (this.disposed) return;
    this.invalidate();
    if (this.renderPass?.updateScene(scene)) return;
    const previousPass = this.renderPass;
    this.renderPass = null;
    try {
      this.renderPass = this.options.createPass(scene);
    } finally {
      previousPass?.dispose();
    }
  }

  invalidate(): void {
    this.generation += 1;
  }

  async pick(request: Request): Promise<Result | null> {
    const generation = ++this.generation;
    const renderPass = this.renderPass;
    if (this.disposed || !renderPass || !renderPass.preparePick(request)) {
      return null;
    }

    let pixels: ArrayBufferView;
    try {
      pixels = await this.target.renderAndRead(
        renderPass.scene,
        PICK_CAMERA,
        this.readback,
      );
    } catch (error) {
      if (generation !== this.generation || this.disposed) return null;
      throw error;
    }

    if (generation !== this.generation || this.disposed) return null;
    if (
      !(pixels instanceof Uint32Array) ||
      pixels.length < this.options.minimumTexelLength
    ) {
      throw new Error(this.options.invalidTexelMessage);
    }
    return this.options.decodeTexel(pixels, renderPass);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.invalidate();
    this.renderPass?.dispose();
    this.renderPass = null;
    this.target.dispose();
    this.readback.release();
  }
}

// Pick materials emit clip-space positions directly. This fixed camera exists
// only to satisfy Three's render(scene, camera) contract.
const PICK_CAMERA = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
PICK_CAMERA.position.set(0, 0, 1);
PICK_CAMERA.updateProjectionMatrix();
