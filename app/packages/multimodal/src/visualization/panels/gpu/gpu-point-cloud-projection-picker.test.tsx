import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  createGpuPointCloudProjectionPickerController,
  createProjectionPickMaterial,
  type GpuPointCloudProjectionPickLayer,
} from "./gpu-point-cloud-projection-picker";

describe("GPU pointcloud projection picker", () => {
  it("renders one integer texel and maps encoded indices to the source layer", async () => {
    const renderer = new FakeProjectionPickRenderer();
    renderer.enqueueReadback(Promise.resolve(new Uint32Array([1, 42, 2, 1])));
    const controller = createGpuPointCloudProjectionPickerController(renderer);
    controller.setScene({
      calibrationHeight: 480,
      calibrationWidth: 640,
      // The empty first layer is omitted from the pass. Encoded layer 1 must
      // still map back to original layer index 1.
      layers: [layer("empty", 0), layer("radar/front", 3)],
    });

    const result = await controller.pick({
      radiusPx: 6,
      targetU: 320,
      targetV: 240,
    });

    expect(result).toEqual({
      layerIndex: 1,
      resourceKey: "radar/front",
      sampleIndex: 1,
      sourceIndex: 41,
    });
    expect(renderer.renderedScenes).toHaveLength(1);
    expect(renderer.renderedScenes[0].children).toHaveLength(1);
    expect((renderer.renderedScenes[0].children[0] as THREE.Sprite).count).toBe(
      3,
    );
    const pickTarget = renderer.readTargets[0];
    expect(pickTarget.width).toBe(1);
    expect(pickTarget.height).toBe(1);
    expect(pickTarget.texture.format).toBe(THREE.RGBAIntegerFormat);
    expect(pickTarget.texture.type).toBe(THREE.UnsignedIntType);

    controller.dispose();
  });

  it("restores every renderer state immediately after submitting the readback", async () => {
    const renderer = new FakeProjectionPickRenderer();
    const pendingReadback = deferred<ArrayBufferView>();
    renderer.enqueueReadback(pendingReadback.promise);
    const controller = createGpuPointCloudProjectionPickerController(renderer);
    controller.setScene({
      calibrationHeight: 100,
      calibrationWidth: 100,
      layers: [layer("lidar", 1)],
    });

    const previousTarget = renderer.renderTarget;
    const previousMrt = renderer.mrt;
    const previousColor = renderer.clearColor.clone();
    const previousAlpha = renderer.clearAlpha;
    const previousAutoClear = renderer.autoClear;
    const previousAutoClearColor = renderer.autoClearColor;
    const previousAutoClearDepth = renderer.autoClearDepth;
    const previousAutoClearStencil = renderer.autoClearStencil;
    const result = controller.pick({ radiusPx: 4, targetU: 50, targetV: 50 });

    expect(renderer.renderTarget).toBe(previousTarget);
    expect(renderer.mrt).toBe(previousMrt);
    expect(renderer.clearColor).toEqual(previousColor);
    expect(renderer.clearAlpha).toBe(previousAlpha);
    expect(renderer.autoClear).toBe(previousAutoClear);
    expect(renderer.autoClearColor).toBe(previousAutoClearColor);
    expect(renderer.autoClearDepth).toBe(previousAutoClearDepth);
    expect(renderer.autoClearStencil).toBe(previousAutoClearStencil);

    pendingReadback.resolve(new Uint32Array([1, 1, 1, 1]));
    await expect(result).resolves.toEqual({
      layerIndex: 0,
      resourceKey: "lidar",
      sampleIndex: 0,
      sourceIndex: 0,
    });
    controller.dispose();
  });

  it("reuses its scene and materials until the projection scene changes", async () => {
    const renderer = new FakeProjectionPickRenderer();
    renderer.enqueueReadback(Promise.resolve(new Uint32Array([1, 1, 1, 1])));
    renderer.enqueueReadback(Promise.resolve(new Uint32Array([1, 2, 2, 1])));
    const controller = createGpuPointCloudProjectionPickerController(renderer);
    controller.setScene({
      calibrationHeight: 100,
      calibrationWidth: 100,
      layers: [layer("lidar", 2)],
    });

    await controller.pick({ radiusPx: 4, targetU: 50, targetV: 50 });
    const firstScene = renderer.renderedScenes[0];
    const firstMaterial = (firstScene.children[0] as THREE.Sprite).material;
    const disposeMaterial = vi.spyOn(firstMaterial, "dispose");

    await controller.pick({ radiusPx: 8, targetU: 60, targetV: 40 });

    expect(renderer.renderedScenes[1]).toBe(firstScene);
    expect(
      (renderer.renderedScenes[1].children[0] as THREE.Sprite).material,
    ).toBe(firstMaterial);
    expect(disposeMaterial).not.toHaveBeenCalled();

    controller.setScene({
      calibrationHeight: 200,
      calibrationWidth: 300,
      layers: [layer("radar", 1)],
    });

    expect(disposeMaterial).toHaveBeenCalledOnce();
    renderer.enqueueReadback(Promise.resolve(new Uint32Array([1, 1, 1, 1])));
    await controller.pick({ radiusPx: 4, targetU: 20, targetV: 20 });
    expect(renderer.renderedScenes[2]).not.toBe(firstScene);
    controller.dispose();
  });

  it("suppresses an async result invalidated before readback completes", async () => {
    const renderer = new FakeProjectionPickRenderer();
    const pendingReadback = deferred<ArrayBufferView>();
    renderer.enqueueReadback(pendingReadback.promise);
    const controller = createGpuPointCloudProjectionPickerController(renderer);
    controller.setScene({
      calibrationHeight: 100,
      calibrationWidth: 100,
      layers: [layer("lidar", 1)],
    });

    const result = controller.pick({ radiusPx: 4, targetU: 50, targetV: 50 });
    controller.invalidate();
    pendingReadback.resolve(new Uint32Array([1, 1, 1, 1]));

    await expect(result).resolves.toBeNull();
    controller.dispose();
  });

  it("lets only the newest overlapping pick publish", async () => {
    const renderer = new FakeProjectionPickRenderer();
    const firstReadback = deferred<ArrayBufferView>();
    const secondReadback = deferred<ArrayBufferView>();
    renderer.enqueueReadback(firstReadback.promise);
    renderer.enqueueReadback(secondReadback.promise);
    const controller = createGpuPointCloudProjectionPickerController(renderer);
    controller.setScene({
      calibrationHeight: 100,
      calibrationWidth: 100,
      layers: [layer("lidar", 2), layer("radar", 2)],
    });

    const first = controller.pick({ radiusPx: 4, targetU: 50, targetV: 50 });
    const second = controller.pick({ radiusPx: 4, targetU: 60, targetV: 60 });
    secondReadback.resolve(new Uint32Array([2, 2, 2, 1]));

    await expect(second).resolves.toEqual({
      layerIndex: 1,
      resourceKey: "radar",
      sampleIndex: 1,
      sourceIndex: 1,
    });

    firstReadback.resolve(new Uint32Array([1, 1, 1, 1]));
    await expect(first).resolves.toBeNull();
    controller.dispose();
  });

  it("does no GPU work for invalid requests or empty scenes", async () => {
    const renderer = new FakeProjectionPickRenderer();
    const controller = createGpuPointCloudProjectionPickerController(renderer);
    controller.setScene({
      calibrationHeight: 100,
      calibrationWidth: 100,
      layers: [],
    });

    await expect(
      controller.pick({ radiusPx: 0, targetU: 50, targetV: 50 }),
    ).resolves.toBeNull();
    await expect(
      controller.pick({ radiusPx: 4, targetU: 50, targetV: 50 }),
    ).resolves.toBeNull();
    expect(renderer.renderedScenes).toHaveLength(0);
    expect(renderer.readTargets).toHaveLength(0);
    controller.dispose();
  });

  it("rejects an incomplete integer texel", async () => {
    const renderer = new FakeProjectionPickRenderer();
    renderer.enqueueReadback(Promise.resolve(new Uint32Array([1, 1])));
    const controller = createGpuPointCloudProjectionPickerController(renderer);
    controller.setScene({
      calibrationHeight: 100,
      calibrationWidth: 100,
      layers: [layer("lidar", 1)],
    });

    await expect(
      controller.pick({ radiusPx: 4, targetU: 50, targetV: 50 }),
    ).rejects.toThrow("non-integer texel");
    controller.dispose();
  });

  it("constructs a depth-writing integer-output point material", () => {
    const material = createProjectionPickMaterial({
      activeLayerIndex: 2,
      calibrationHeight: 480,
      calibrationWidth: 640,
      positionAttribute: layer("lidar", 1).positionAttribute,
      projection: {
        kind: "pinhole",
        projectionMatrix: new THREE.Matrix4(),
      },
      request: { radiusPx: 6, targetU: 320, targetV: 240 },
      sourceIndexAttribute: layer("lidar", 1).sourceIndexAttribute,
    });

    expect(material.positionNode).not.toBeNull();
    expect(material.scaleNode).not.toBeNull();
    expect(material.depthNode).not.toBeNull();
    expect(material.fragmentNode).not.toBeNull();
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(true);
    expect(material.depthFunc).toBe(THREE.LessEqualDepth);
    expect(material.blending).toBe(THREE.NoBlending);
    material.dispose();
  });

  it("rejects non-WebGPU renderers instead of falling back to CPU", () => {
    expect(() => createGpuPointCloudProjectionPickerController({})).toThrow(
      "GPU projection picking requires Three WebGPURenderer",
    );
  });
});

function layer(
  resourceKey: string,
  sampledPointCount: number,
): GpuPointCloudProjectionPickLayer {
  const capacity = Math.max(1, sampledPointCount);
  return {
    positionAttribute: new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 3),
      3,
    ),
    projection: {
      kind: "pinhole",
      projectionMatrix: new THREE.Matrix4(),
    },
    resourceKey,
    sampledPointCount,
    sourceIndexAttribute: new THREE.InstancedBufferAttribute(
      Uint32Array.from({ length: capacity }, (_, index) => index),
      1,
    ),
  };
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly reject: (error: unknown) => void;
  readonly resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

class FakeProjectionPickRenderer {
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
