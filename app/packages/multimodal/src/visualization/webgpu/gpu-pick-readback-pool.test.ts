import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { acquireGpuPickReadbackPool } from "./gpu-pick-readback-pool";

afterEach(() => vi.unstubAllGlobals());

describe("GPU pick readback pool", () => {
  it("shares and reuses aligned readback buffers per renderer", async () => {
    vi.stubGlobal("GPUBufferUsage", { COPY_DST: 1, MAP_READ: 2 });
    vi.stubGlobal("GPUMapMode", { READ: 1 });
    const sourcePixels = Uint32Array.from([7, 11, 0, 1]);
    const buffers: FakeGpuBuffer[] = [];
    const device = {
      createBuffer: vi.fn(() => {
        const buffer = new FakeGpuBuffer();
        buffers.push(buffer);
        return buffer;
      }),
      createCommandEncoder: vi.fn(() => ({
        copyTextureToBuffer: (
          source: { texture: { pixels: Uint32Array } },
          destination: { buffer: FakeGpuBuffer },
        ) => {
          new Uint32Array(destination.buffer.bytes).set(source.texture.pixels);
        },
        finish: () => ({}),
      })),
      queue: { submit: vi.fn() },
    };
    const publicReadback = vi.fn(async () => new Uint32Array(4));
    const renderer = {
      backend: {
        device,
        get: vi.fn(() => ({ texture: { pixels: sourcePixels } })),
      },
      readRenderTargetPixelsAsync: publicReadback,
    };
    const target = new THREE.RenderTarget(1, 1);
    const directRenderer = renderer as unknown as Parameters<
      typeof acquireGpuPickReadbackPool
    >[0];
    const first = acquireGpuPickReadbackPool(directRenderer);
    const second = acquireGpuPickReadbackPool(directRenderer);

    await expect(first.read(target)).resolves.toEqual(sourcePixels);
    await expect(second.read(target)).resolves.toEqual(sourcePixels);

    expect(device.createBuffer).toHaveBeenCalledTimes(1);
    expect(publicReadback).not.toHaveBeenCalled();
    expect(buffers[0].unmap).toHaveBeenCalledTimes(2);
    first.release();
    expect(buffers[0].destroy).not.toHaveBeenCalled();
    second.release();
    expect(buffers[0].destroy).toHaveBeenCalledTimes(1);
    target.dispose();
  });

  it("uses Three's public path when direct WebGPU access is unavailable", async () => {
    const pixels = Uint32Array.from([1, 2, 0, 1]);
    const publicReadback = vi.fn(async () => pixels);
    const renderer = { readRenderTargetPixelsAsync: publicReadback };
    const target = new THREE.RenderTarget(1, 1);
    const lease = acquireGpuPickReadbackPool(renderer);

    await expect(lease.read(target)).resolves.toBe(pixels);
    expect(publicReadback).toHaveBeenCalledWith(target, 0, 0, 1, 1);
    lease.release();
    target.dispose();
  });
});

class FakeGpuBuffer {
  readonly bytes = new ArrayBuffer(256);
  readonly destroy = vi.fn();
  readonly mapAsync = vi.fn(async () => undefined);
  readonly unmap = vi.fn();

  getMappedRange(offset: number, size: number): ArrayBuffer {
    return this.bytes.slice(offset, offset + size);
  }
}
