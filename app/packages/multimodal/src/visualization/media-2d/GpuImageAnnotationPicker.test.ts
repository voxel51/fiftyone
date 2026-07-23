import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";

import type { PreparedImageAnnotations } from "./gpu-image-annotation-preparation";
import {
  createGpuImageAnnotationPickMaterial,
  createGpuImageAnnotationPickerController,
} from "./GpuImageAnnotationPicker";
import {
  getGpuImageAnnotationResource,
  resetGpuImageAnnotationResourcesForTests,
} from "./gpu-image-annotation-resources";

afterEach(() => resetGpuImageAnnotationResourcesForTests());

describe("GPU image annotation picker", () => {
  it("renders one integer texel and decodes primitive identity", async () => {
    const renderer = new FakePickRenderer();
    renderer.enqueueReadback(Promise.resolve(new Uint32Array([3, 2, 0, 1])));
    const resource = getGpuImageAnnotationResource("tile", payload(3));
    const controller = createGpuImageAnnotationPickerController(renderer);
    controller.setScene({ imageHeight: 100, imageWidth: 200, resource });

    await expect(
      controller.pick({ radiusPx: 4, targetU: 50, targetV: 20 }),
    ).resolves.toEqual({ primitiveIndex: 2 });
    expect(renderer.renderedScenes).toHaveLength(1);
    expect((renderer.renderedScenes[0].children[0] as THREE.Sprite).count).toBe(
      3,
    );
    expect(renderer.readTargets[0].width).toBe(1);
    expect(renderer.readTargets[0].texture.format).toBe(
      THREE.RGBAIntegerFormat,
    );
    controller.dispose();
  });

  it("invalidates stale readbacks and rejects picks outside the image", async () => {
    const renderer = new FakePickRenderer();
    const pending = deferred<ArrayBufferView>();
    renderer.enqueueReadback(pending.promise);
    const resource = getGpuImageAnnotationResource("tile", payload(1));
    const controller = createGpuImageAnnotationPickerController(renderer);
    controller.setScene({ imageHeight: 100, imageWidth: 200, resource });

    const result = controller.pick({ radiusPx: 4, targetU: 50, targetV: 20 });
    controller.invalidate();
    pending.resolve(new Uint32Array([1, 1, 0, 1]));
    await expect(result).resolves.toBeNull();
    await expect(
      controller.pick({ radiusPx: 4, targetU: 250, targetV: 20 }),
    ).resolves.toBeNull();
    expect(renderer.renderedScenes).toHaveLength(1);
    controller.dispose();
  });

  it("constructs an analytic, depth-writing integer material", () => {
    const resource = getGpuImageAnnotationResource("tile", payload(4));
    const material = createGpuImageAnnotationPickMaterial(resource.pick, {
      radiusPx: 6,
      targetU: 40,
      targetV: 50,
    });

    expect(material.positionNode).not.toBeNull();
    expect(material.scaleNode).not.toBeNull();
    expect(material.depthNode).not.toBeNull();
    expect(material.fragmentNode).not.toBeNull();
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(true);
    expect(material.blending).toBe(THREE.NoBlending);
    material.dispose();
  });

  it("refuses to silently fall back to CPU picking", () => {
    expect(() => createGpuImageAnnotationPickerController({})).toThrow(
      "requires Three WebGPURenderer",
    );
  });
});

function payload(count: number): PreparedImageAnnotations {
  return {
    metadata: [],
    picks: {
      a: new Float32Array(count * 2),
      b: new Float32Array(count * 2),
      c: new Float32Array(count * 2),
      count,
      kinds: new Float32Array(count),
      orders: Float32Array.from({ length: count }, (_, index) => index),
      primitiveIndices: Uint32Array.from(
        { length: count },
        (_, index) => index,
      ),
      radii: new Float32Array(count),
    },
    pointOffsets: new Uint32Array(1),
    points: {
      centers: new Float32Array(),
      colors: new Float32Array(),
      count: 0,
      diameters: new Float32Array(),
      kinds: new Float32Array(),
      primitiveIndices: new Uint32Array(),
      thicknesses: new Float32Array(),
    },
    segmentOffsets: new Uint32Array(1),
    segments: {
      colors: new Float32Array(),
      count: 0,
      ends: new Float32Array(),
      primitiveIndices: new Uint32Array(),
      starts: new Float32Array(),
      thicknesses: new Float32Array(),
    },
  };
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

class FakePickRenderer {
  autoClear = false;
  autoClearColor = false;
  autoClearDepth = false;
  autoClearStencil = true;
  readonly isWebGPURenderer = true as const;
  clearAlpha = 0.25;
  clearColor = new THREE.Color(0x123456);
  mrt: unknown = { name: "previous-mrt" };
  renderTarget: THREE.RenderTarget | null = new THREE.RenderTarget(2, 2);
  readonly readTargets: THREE.RenderTarget[] = [];
  readonly renderedScenes: THREE.Scene[] = [];
  private readonly readbacks: Promise<ArrayBufferView>[] = [];

  enqueueReadback(readback: Promise<ArrayBufferView>): void {
    this.readbacks.push(readback);
  }

  getClearAlpha(): number {
    return this.clearAlpha;
  }

  getClearColor(target: THREE.Color): THREE.Color {
    return target.copy(this.clearColor);
  }

  getMRT(): unknown {
    return this.mrt;
  }

  getRenderTarget(): THREE.RenderTarget | null {
    return this.renderTarget;
  }

  readRenderTargetPixelsAsync(
    renderTarget: THREE.RenderTarget,
  ): Promise<ArrayBufferView> {
    this.readTargets.push(renderTarget);
    return (
      this.readbacks.shift() ?? Promise.resolve(new Uint32Array([0, 0, 0, 1]))
    );
  }

  render(scene: THREE.Object3D): void {
    this.renderedScenes.push(scene as THREE.Scene);
  }

  setClearColor(color: THREE.ColorRepresentation, alpha = 1): void {
    this.clearColor.set(color);
    this.clearAlpha = alpha;
  }

  setMRT(mrt: unknown): void {
    this.mrt = mrt;
  }

  setRenderTarget(renderTarget: THREE.RenderTarget | null): void {
    this.renderTarget = renderTarget;
  }
}
