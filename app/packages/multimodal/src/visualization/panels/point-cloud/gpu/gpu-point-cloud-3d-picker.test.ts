import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  createGpuPointCloud3dPickerController,
  createGpuPointCloud3dPickerRegistry,
  createPointCloud3dPickMaterial,
  pointCloud3dPickColor,
  pointCloud3dPickWorldPosition,
  type GpuPointCloud3dPickLayer,
  type GpuPointCloud3dPickRequest,
} from "./gpu-point-cloud-3d-picker";

describe("GPU 3D pointcloud picker", () => {
  it("reads one integer texel and resolves a canonical sample in O(1)", async () => {
    const renderer = new FakePointCloud3dPickRenderer();
    renderer.enqueueReadback(Promise.resolve(new Uint32Array([1, 2, 0, 1])));
    const controller = createGpuPointCloud3dPickerController(renderer);
    const source = layer({
      colors: Float32Array.from([1, 0, 0, 0.2, 0.4, 0.6]),
      layerId: "radar/front",
      positions: Float32Array.from([1, 2, 3, 4, 5, 6]),
      sampledPointCount: 2,
    });
    source.object.position.set(10, 0, 0);
    controller.setScene([
      layer({ layerId: "empty", positions: new Float32Array(0) }),
      source,
    ]);

    const result = await controller.pick(request());

    expect(result).toEqual({
      color: [Math.fround(0.2), Math.fround(0.4), Math.fround(0.6)],
      layerId: "radar/front",
      resourceKey: "radar/front/frame",
      sampleIndex: 1,
      worldPosition: [14, 5, 6],
    });
    expect(renderer.renderedScenes).toHaveLength(1);
    expect(renderer.renderedScenes[0].children).toHaveLength(1);
    expect((renderer.renderedScenes[0].children[0] as THREE.Sprite).count).toBe(
      2,
    );
    const target = renderer.readTargets[0];
    expect(target.width).toBe(1);
    expect(target.height).toBe(1);
    expect(target.texture.format).toBe(THREE.RGBAIntegerFormat);
    expect(target.texture.type).toBe(THREE.UnsignedIntType);
    controller.dispose();
  });

  it("restores renderer state while asynchronous readback is pending", async () => {
    const renderer = new FakePointCloud3dPickRenderer();
    const pending = deferred<ArrayBufferView>();
    renderer.enqueueReadback(pending.promise);
    const controller = createGpuPointCloud3dPickerController(renderer);
    controller.setScene([layer({ layerId: "lidar" })]);

    const previousTarget = renderer.renderTarget;
    const previousMrt = renderer.mrt;
    const previousColor = renderer.clearColor.clone();
    const previousAlpha = renderer.clearAlpha;
    const previousAutoClear = renderer.autoClear;
    const previousAutoClearColor = renderer.autoClearColor;
    const previousAutoClearDepth = renderer.autoClearDepth;
    const previousAutoClearStencil = renderer.autoClearStencil;
    const result = controller.pick(request());

    expect(renderer.renderTarget).toBe(previousTarget);
    expect(renderer.mrt).toBe(previousMrt);
    expect(renderer.clearColor).toEqual(previousColor);
    expect(renderer.clearAlpha).toBe(previousAlpha);
    expect(renderer.autoClear).toBe(previousAutoClear);
    expect(renderer.autoClearColor).toBe(previousAutoClearColor);
    expect(renderer.autoClearDepth).toBe(previousAutoClearDepth);
    expect(renderer.autoClearStencil).toBe(previousAutoClearStencil);

    pending.resolve(new Uint32Array([1, 1, 0, 1]));
    await expect(result).resolves.toMatchObject({
      layerId: "lidar",
      sampleIndex: 0,
    });
    controller.dispose();
  });

  it("invalidates stale readbacks when registered frame storage changes", async () => {
    const renderer = new FakePointCloud3dPickRenderer();
    const pending = deferred<ArrayBufferView>();
    renderer.enqueueReadback(pending.promise);
    const controller = createGpuPointCloud3dPickerController(renderer);
    controller.setScene([layer({ layerId: "lidar" })]);

    const result = controller.pick(request());
    controller.setScene([layer({ layerId: "lidar", resourceKey: "next" })]);
    pending.resolve(new Uint32Array([1, 1, 0, 1]));

    await expect(result).resolves.toBeNull();
    controller.dispose();
  });

  it("reuses the pick pass when frame storage identity stays stable", async () => {
    const renderer = new FakePointCloud3dPickRenderer();
    const controller = createGpuPointCloud3dPickerController(renderer);
    const first = layer({
      layerId: "lidar",
      positions: Float32Array.from([1, 2, 3, 4, 5, 6]),
    });
    controller.setScene([first]);
    renderer.enqueueReadback(Promise.resolve(new Uint32Array([1, 1, 0, 1])));
    await controller.pick(request());
    const sprite = renderer.renderedScenes[0].children[0] as THREE.Sprite;
    const material = sprite.material;

    controller.setScene([
      {
        ...first,
        renderedPointCount: 1,
        resourceKey: "lidar/next-frame",
      },
    ]);
    renderer.enqueueReadback(Promise.resolve(new Uint32Array([1, 1, 0, 1])));
    await expect(controller.pick(request())).resolves.toMatchObject({
      resourceKey: "lidar/next-frame",
    });

    expect(renderer.renderedScenes[1]).toBe(renderer.renderedScenes[0]);
    expect(renderer.renderedScenes[1].children[0]).toBe(sprite);
    expect(sprite.material).toBe(material);
    expect(sprite.count).toBe(1);
    controller.dispose();
  });

  it("does no GPU work for invalid requests or an empty scene", async () => {
    const renderer = new FakePointCloud3dPickRenderer();
    const controller = createGpuPointCloud3dPickerController(renderer);
    controller.setScene([]);

    await expect(controller.pick(request({ radiusPx: 0 }))).resolves.toBeNull();
    await expect(controller.pick(request())).resolves.toBeNull();
    expect(renderer.renderedScenes).toHaveLength(0);
    controller.dispose();
  });

  it("builds a nearest-depth integer material over the shared flat buffer", () => {
    const source = layer({
      layerId: "lidar",
      positions: new Float32Array(10 * 3),
      renderedPointCount: 6,
      sampledPointCount: 10,
    });
    const material = createPointCloud3dPickMaterial({
      activeLayerIndex: 2,
      far: Number.POSITIVE_INFINITY,
      near: 0,
      pointerNdc: new THREE.Vector2(),
      positionAttribute: source.positionAttribute,
      positionLayout: "flat",
      radiusPx: 6,
      rayDirection: new THREE.Vector3(0, 0, -1),
      rayOrigin: new THREE.Vector3(),
      renderedPointCount: 6,
      sampledPointCount: 10,
      viewProjection: new THREE.Matrix4(),
      viewport: new THREE.Vector2(640, 480),
      worldMatrix: new THREE.Matrix4(),
    });

    expect(material.positionNode).not.toBeNull();
    expect(material.scaleNode).not.toBeNull();
    expect(material.depthNode).not.toBeNull();
    expect(material.fragmentNode).not.toBeNull();
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(true);
    expect(material.depthFunc).toBe(THREE.LessDepth);
    expect(material.blending).toBe(THREE.NoBlending);
    material.dispose();
  });

  it("keeps registry replacement and cleanup race-safe", () => {
    const registry = createGpuPointCloud3dPickerRegistry();
    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);
    const first = layer({ layerId: "lidar", resourceKey: "first" });
    const second = layer({ layerId: "lidar", resourceKey: "second" });

    const unregisterFirst = registry.register(first);
    const unregisterSecond = registry.register(second);
    unregisterFirst();

    expect(registry.snapshot()).toEqual([second]);
    expect(listener).toHaveBeenCalledTimes(2);

    unregisterSecond();
    expect(registry.snapshot()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
  });

  it("reconstructs flat and vec3 positions without scanning", () => {
    const flat = layer({
      layerId: "flat",
      positions: Float32Array.from([1, 2, 3, 4, 5, 6]),
      sampledPointCount: 2,
    });
    const matrix = new THREE.Matrix4().makeTranslation(10, 20, 30);
    expect(pointCloud3dPickWorldPosition(flat, 1, matrix)).toEqual([
      14, 25, 36,
    ]);
    expect(pointCloud3dPickColor(flat, 1)).toBeNull();
    expect(pointCloud3dPickWorldPosition(flat, 2, matrix)).toBeNull();

    const vec3: GpuPointCloud3dPickLayer = {
      ...flat,
      positionAttribute: new THREE.BufferAttribute(
        Float32Array.from([7, 8, 9]),
        3,
      ),
      positionLayout: "vec3",
      sampledPointCount: 1,
    };
    expect(pointCloud3dPickWorldPosition(vec3, 0, new THREE.Matrix4())).toEqual(
      [7, 8, 9],
    );
  });

  it("rejects non-WebGPU renderers instead of restoring the CPU scan", () => {
    expect(() => createGpuPointCloud3dPickerController({})).toThrow(
      "GPU 3D point picking requires Three WebGPURenderer",
    );
  });
});

function layer({
  colors,
  layerId,
  positions = Float32Array.from([1, 2, 3]),
  renderedPointCount,
  resourceKey,
  sampledPointCount,
}: {
  readonly colors?: Float32Array;
  readonly layerId: string;
  readonly positions?: Float32Array;
  readonly renderedPointCount?: number;
  readonly resourceKey?: string;
  readonly sampledPointCount?: number;
}): GpuPointCloud3dPickLayer {
  const count = sampledPointCount ?? Math.floor(positions.length / 3);
  return {
    colorAttribute: colors ? new THREE.BufferAttribute(colors, 3) : null,
    layerId,
    object: new THREE.Object3D(),
    positionAttribute: new THREE.BufferAttribute(positions, 1),
    positionLayout: "flat",
    renderedPointCount: renderedPointCount ?? count,
    resourceKey: resourceKey ?? `${layerId}/frame`,
    sampledPointCount: count,
  };
}

function request(
  overrides: Partial<GpuPointCloud3dPickRequest> = {},
): GpuPointCloud3dPickRequest {
  const camera = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 1_000);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return {
    camera,
    far: Number.POSITIVE_INFINITY,
    near: 0,
    pointerNdc: new THREE.Vector2(),
    radiusPx: 6,
    rayDirection: new THREE.Vector3(0, 0, -1),
    rayOrigin: new THREE.Vector3(0, 0, 10),
    raycasterLayers: new THREE.Layers(),
    viewportHeightPx: 480,
    viewportWidthPx: 640,
    ...overrides,
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

class FakePointCloud3dPickRenderer {
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
