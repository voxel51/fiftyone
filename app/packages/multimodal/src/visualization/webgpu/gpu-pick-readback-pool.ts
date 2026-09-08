import * as THREE from "three";

const COPY_BYTES_PER_ROW = 256;
const PICK_TEXEL_BYTES = 4 * Uint32Array.BYTES_PER_ELEMENT;
const READBACK_SLOT_COUNT = 3;

// WebGPU requires bytesPerRow to be 256-byte aligned even though the pick
// target contains only one RGBA32Uint texel (16 useful bytes). The pool keeps
// the aligned allocation and maps only the useful prefix.

interface PickReadbackRenderer {
  readonly backend?: {
    readonly device?: GPUDevice;
    get(texture: THREE.Texture): { readonly texture?: GPUTexture } | undefined;
  };
  readRenderTargetPixelsAsync(
    renderTarget: THREE.RenderTarget,
    x: number,
    y: number,
    width: number,
    height: number,
  ): Promise<ArrayBufferView>;
}

/** Exclusive lease for reading one-texel GPU picking results. */
export interface GpuPickReadbackLease {
  read(renderTarget: THREE.RenderTarget): Promise<ArrayBufferView>;
  release(): void;
}

interface ReadbackSlot {
  readonly buffer: GPUBuffer;
  busy: boolean;
}

const pools = new WeakMap<object, GpuPickReadbackPool>();

/**
 * Leases the renderer-local one-texel readback pool. Three's public readback
 * path allocates and destroys a mapped GPUBuffer for every call;
 * this direct path keeps three 256-byte aligned buffers rotating across all
 * projection views sharing the same renderer.
 */
export function acquireGpuPickReadbackPool(
  renderer: PickReadbackRenderer,
): GpuPickReadbackLease {
  const rendererKey = renderer as object;
  let pool = pools.get(rendererKey);
  if (!pool) {
    pool = new GpuPickReadbackPool(renderer, () => {
      if (pools.get(rendererKey) === pool) pools.delete(rendererKey);
    });
    pools.set(rendererKey, pool);
  }
  return pool.acquire();
}

class GpuPickReadbackPool {
  private directReadbackDisabled = false;
  private disposeRequested = false;
  private leaseCount = 0;
  private nextSlotIndex = 0;
  private readonly slots: ReadbackSlot[] = [];
  private readonly waiters: Array<(slot: ReadbackSlot) => void> = [];

  constructor(
    private readonly renderer: PickReadbackRenderer,
    private readonly onDispose: () => void,
  ) {}

  acquire(): GpuPickReadbackLease {
    // A renderer can host many camera views and both picker types. Leases keep
    // their shared pool alive until the last controller using that renderer is
    // disposed; individual reads reserve slots separately below.
    this.leaseCount += 1;
    let released = false;
    return {
      read: (target) => this.read(target),
      release: () => {
        if (released) return;
        released = true;
        this.leaseCount = Math.max(0, this.leaseCount - 1);
        if (this.leaseCount === 0) {
          this.disposeRequested = true;
          this.onDispose();
          this.disposeIfIdle();
        }
      },
    };
  }

  private async read(
    renderTarget: THREE.RenderTarget,
  ): Promise<ArrayBufferView> {
    const backend = directReadbackBackend(this.renderer, renderTarget);
    if (!backend || this.directReadbackDisabled) {
      return this.fallbackRead(renderTarget);
    }

    // mapAsync may remain pending across multiple frames. Rotating three
    // buffers avoids serializing a new dwell behind the previous GPU copy
    // without allocating a mapped buffer for every request.
    const slot = await this.reserveSlot(backend.device);
    let mapped = false;
    try {
      const encoder = backend.device.createCommandEncoder({
        label: "FiftyOne point pick readback",
      });
      encoder.copyTextureToBuffer(
        { origin: { x: 0, y: 0, z: 0 }, texture: backend.texture },
        {
          buffer: slot.buffer,
          bytesPerRow: COPY_BYTES_PER_ROW,
          rowsPerImage: 1,
        },
        { depthOrArrayLayers: 1, height: 1, width: 1 },
      );
      backend.device.queue.submit([encoder.finish()]);
      await slot.buffer.mapAsync(GPUMapMode.READ, 0, PICK_TEXEL_BYTES);
      mapped = true;
      // Copy before unmap: a mapped range is invalid as soon as the GPUBuffer
      // is unmapped in finally.
      const bytes = slot.buffer.getMappedRange(0, PICK_TEXEL_BYTES).slice(0);
      return new Uint32Array(bytes);
    } catch {
      // Three's backend is intentionally private. If a future Three upgrade
      // changes it, fail open to the public API for this renderer lifetime.
      this.directReadbackDisabled = true;
      return this.fallbackRead(renderTarget);
    } finally {
      if (mapped) slot.buffer.unmap();
      this.releaseSlot(slot);
    }
  }

  private fallbackRead(
    renderTarget: THREE.RenderTarget,
  ): Promise<ArrayBufferView> {
    return this.renderer.readRenderTargetPixelsAsync(renderTarget, 0, 0, 1, 1);
  }

  private async reserveSlot(device: GPUDevice): Promise<ReadbackSlot> {
    // Search from the rotating cursor so one hot caller does not repeatedly
    // claim slot zero while other camera views wait.
    for (let offset = 0; offset < this.slots.length; offset++) {
      const index = (this.nextSlotIndex + offset) % this.slots.length;
      const slot = this.slots[index];
      if (slot.busy) continue;
      slot.busy = true;
      this.nextSlotIndex = (index + 1) % READBACK_SLOT_COUNT;
      return slot;
    }

    if (this.slots.length < READBACK_SLOT_COUNT) {
      const slot = {
        buffer: device.createBuffer({
          label: "FiftyOne point pick readback",
          mappedAtCreation: false,
          size: COPY_BYTES_PER_ROW,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        }),
        busy: true,
      };
      this.slots.push(slot);
      this.nextSlotIndex = this.slots.length % READBACK_SLOT_COUNT;
      return slot;
    }

    // All slots are in flight. The released slot is handed directly to the
    // oldest waiter and deliberately remains marked busy during the handoff.
    return new Promise<ReadbackSlot>((resolve) => this.waiters.push(resolve));
  }

  private releaseSlot(slot: ReadbackSlot): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(slot);
      return;
    }
    slot.busy = false;
    this.disposeIfIdle();
  }

  private disposeIfIdle(): void {
    // Releasing the final controller is not enough to destroy buffers: an
    // already-submitted copy/map must finish first. The last releaseSlot call
    // performs the deferred destruction.
    if (
      !this.disposeRequested ||
      this.waiters.length > 0 ||
      this.slots.some((slot) => slot.busy)
    ) {
      return;
    }
    for (const slot of this.slots) slot.buffer.destroy();
    this.slots.length = 0;
  }
}

function directReadbackBackend(
  renderer: PickReadbackRenderer,
  renderTarget: THREE.RenderTarget,
): { readonly device: GPUDevice; readonly texture: GPUTexture } | null {
  // This is a guarded optimization over Three internals. Any missing or
  // changed backend shape returns null and uses the public (allocating)
  // readRenderTargetPixelsAsync path instead of breaking picking.
  if (
    typeof GPUBufferUsage === "undefined" ||
    typeof GPUMapMode === "undefined"
  ) {
    return null;
  }
  const backend = renderer.backend;
  const device = backend?.device;
  const texture = backend?.get(renderTarget.textures[0])?.texture;
  if (
    !device ||
    !texture ||
    typeof device.createBuffer !== "function" ||
    typeof device.createCommandEncoder !== "function" ||
    typeof device.queue?.submit !== "function"
  ) {
    return null;
  }
  return { device, texture };
}
