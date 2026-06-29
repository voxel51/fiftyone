import { byteSourceAccessKey } from "../../../query/bytes";
import { mcapError, mcapErrorMessage } from "../errors";
import { McapGridPreviewTransport } from "./grid-preview-transport";
import type {
  McapGridPreviewRequestPayload,
  McapGridPreviewResult,
  McapGridPreviewWorkerRequest,
  McapGridPreviewWorkerResponse,
} from "./grid-preview-worker-types";
import { workerFetchParameters } from "./worker-resource-client";

// Low-resource machines should not be forced to run multiple MCAP workers.
const MIN_GRID_PREVIEW_WORKERS = 1;

// Also bound the grid preview pool small. Each worker may build/cache MCAP readers,
// and the regular App still needs main-thread and network/decoder headroom.
const MAX_GRID_PREVIEW_WORKERS = 5;
const RESERVED_GRID_PREVIEW_WORKER_CORES = 2;

type McapGridPreviewWorkerSlot = {
  readonly transport: McapGridPreviewTransport;
  worker?: Worker;
};

/**
 * Options for one grid preview pool request.
 */
export interface McapGridPreviewPoolRequestOptions {
  readonly signal?: AbortSignal;
}

/**
 * Construction options for the shared MCAP grid preview worker pool.
 */
export interface CreateMcapGridPreviewPoolOptions {
  readonly poolSize?: number;
  readonly workerFactory?: () => Worker;
}

/**
 * Shared bounded worker pool for MCAP grid previews. Grid cells acquire the
 * pool while mounted; workers are terminated once the last user releases it.
 */
export class McapGridPreviewWorkerPool {
  private readonly poolSize: number;
  private refCount = 0;
  private readonly slots: McapGridPreviewWorkerSlot[];

  constructor(private readonly options: CreateMcapGridPreviewPoolOptions = {}) {
    this.poolSize = normalizePoolSize(options.poolSize);
    this.slots = Array.from({ length: this.poolSize }, () => ({
      transport: new McapGridPreviewTransport(),
    }));
  }

  acquire(): void {
    this.refCount += 1;
  }

  release(): void {
    if (this.refCount === 0) {
      return;
    }

    this.refCount -= 1;
    if (this.refCount === 0) {
      this.resetSlots("MCAP grid preview pool released");
    }
  }

  request(
    payload: McapGridPreviewRequestPayload,
    options: McapGridPreviewPoolRequestOptions = {},
  ): Promise<McapGridPreviewResult> {
    const sourceKey = byteSourceAccessKey(payload.source);
    const slot = this.slotForSource(sourceKey);

    return slot.transport.request(this.workerForSlot(slot), payload, options);
  }

  dispose(): void {
    this.refCount = 0;
    this.resetSlots("MCAP grid preview pool disposed");
  }

  private slotForSource(sourceKey: string): McapGridPreviewWorkerSlot {
    // MCAP grid workers cache indexed readers by source, so keep source
    // affinity. Stateless renderer pools can round-robin; this one should not.
    return this.slots[hashSourceKey(sourceKey) % this.poolSize];
  }

  private workerForSlot(slot: McapGridPreviewWorkerSlot): Worker {
    if (slot.worker) {
      return slot.worker;
    }

    let worker: Worker | undefined;
    try {
      worker = this.createWorker();
      slot.worker = worker;
      worker.onmessage = (event: MessageEvent<McapGridPreviewWorkerResponse>) =>
        slot.transport.handleResponse(event.data);
      worker.onerror = (event) => {
        this.resetSlot(slot, event.message || "MCAP grid preview worker error");
      };

      const initRequest: McapGridPreviewWorkerRequest = {
        payload: workerFetchParameters(),
        type: "init",
      };
      worker.postMessage(initRequest);
    } catch (error) {
      if (slot.worker === worker) {
        this.resetSlot(
          slot,
          mcapErrorMessage(error, "MCAP grid preview worker startup failed"),
        );
      } else {
        disposeWorker(worker);
      }
      throw mcapError(error);
    }

    return worker;
  }

  private createWorker(): Worker {
    if (this.options.workerFactory) {
      return this.options.workerFactory();
    }

    return new Worker(new URL("./grid-preview-worker.ts", import.meta.url), {
      type: "module",
    });
  }

  private resetSlots(reason: string) {
    for (const slot of this.slots) {
      this.resetSlot(slot, reason);
    }
  }

  private resetSlot(slot: McapGridPreviewWorkerSlot, reason: string) {
    const worker = slot.worker;
    delete slot.worker;

    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      try {
        const disposeRequest: McapGridPreviewWorkerRequest = {
          type: "dispose",
        };
        worker.postMessage(disposeRequest);
      } catch {
        // The worker may already be gone.
      }
      worker.terminate();
    }

    slot.transport.rejectAll(reason);
  }
}

let sharedPool: McapGridPreviewWorkerPool | null = null;
let sharedPoolOptions: CreateMcapGridPreviewPoolOptions = {};

/**
 * Returns the singleton MCAP grid preview worker pool.
 */
export function getMcapGridPreviewPool(): McapGridPreviewWorkerPool {
  if (!sharedPool) {
    sharedPool = new McapGridPreviewWorkerPool(sharedPoolOptions);
  }

  return sharedPool;
}

/**
 * Disposes and reconfigures the singleton grid preview pool for tests.
 */
export function resetMcapGridPreviewPoolForTests(
  options: CreateMcapGridPreviewPoolOptions = {},
): void {
  sharedPool?.dispose();
  sharedPool = null;
  sharedPoolOptions = options;
}

/**
 * Hashes a source key (FNV-1a) for deterministic worker affinity.
 */
export function hashSourceKey(sourceKey: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < sourceKey.length; index++) {
    hash ^= sourceKey.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

function normalizePoolSize(poolSize: number | undefined): number {
  // Default to the browser's logical CPU count minus two, then clamp below.
  // This reserves room for the main thread and other App work when the machine
  // has enough cores. Small machines naturally collapse to a single worker.
  const hardwareConcurrency = globalThis.navigator?.hardwareConcurrency;
  const defaultPoolSize =
    typeof hardwareConcurrency === "number" &&
    Number.isFinite(hardwareConcurrency)
      ? hardwareConcurrency - RESERVED_GRID_PREVIEW_WORKER_CORES
      : MIN_GRID_PREVIEW_WORKERS;

  const requested = poolSize ?? defaultPoolSize;

  if (!Number.isFinite(requested)) {
    return MIN_GRID_PREVIEW_WORKERS;
  }

  // Clamp to min/max:
  // - below 1: keep at least one decoder available
  // - above 4: avoid overloading the browser with MCAP readers/decoders
  return clamp(
    Math.trunc(requested),
    MIN_GRID_PREVIEW_WORKERS,
    MAX_GRID_PREVIEW_WORKERS,
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function disposeWorker(worker: Worker | undefined) {
  if (!worker) {
    return;
  }

  worker.onmessage = null;
  worker.onerror = null;
  worker.terminate();
}
