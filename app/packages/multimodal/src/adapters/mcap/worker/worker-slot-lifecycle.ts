import { errorMessage, toError } from "../../../utils/errors";

/** Mutable worker slot owned by one transport lane or pool position. */
export interface McapWorkerSlot {
  worker?: Worker;
}

/** Domain hooks around the shared worker-slot lifecycle. */
export interface McapWorkerSlotLifecycleOptions<
  Slot extends McapWorkerSlot,
  Request,
  Response,
> {
  createWorker(): Worker;
  readonly disposeRequest: Request;
  handleResponse(slot: Slot, response: Response): void;
  rejectAll(slot: Slot, reason: string): void;
  readonly startupErrorMessage: string;
  readonly workerErrorMessage: string;
}

/** Shared create/reset/dispose lifecycle for MCAP worker slots. */
export interface McapWorkerSlotLifecycle<Slot extends McapWorkerSlot, Request> {
  resetSlot(slot: Slot, reason: string): void;
  workerForSlot(slot: Slot, initRequest: Request): Worker;
}

/** Creates a worker-slot lifecycle with domain-specific transport hooks. */
export function createMcapWorkerSlotLifecycle<
  Slot extends McapWorkerSlot,
  Request,
  Response,
>(
  options: McapWorkerSlotLifecycleOptions<Slot, Request, Response>,
): McapWorkerSlotLifecycle<Slot, Request> {
  const resetSlot = (slot: Slot, reason: string): void => {
    const worker = slot.worker;
    slot.worker = undefined;

    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      try {
        worker.postMessage(options.disposeRequest);
      } catch {
        // The worker may already be gone.
      }
      worker.terminate();
    }

    options.rejectAll(slot, reason);
  };

  return {
    resetSlot,
    workerForSlot(slot, initRequest) {
      if (slot.worker) {
        return slot.worker;
      }

      let worker: Worker | undefined;
      try {
        worker = options.createWorker();
        // Wire handlers before init so a synchronous postMessage failure or
        // very early response uses the same transport and reset paths.
        slot.worker = worker;
        worker.onmessage = (event: MessageEvent<Response>) =>
          options.handleResponse(slot, event.data);
        worker.onerror = (event) => {
          resetSlot(slot, event.message || options.workerErrorMessage);
        };
        worker.postMessage(initRequest);
        return worker;
      } catch (error) {
        if (slot.worker === worker) {
          resetSlot(slot, errorMessage(error, options.startupErrorMessage));
        } else {
          disposeWorker(worker);
        }
        throw toError(error);
      }
    },
  };
}

function disposeWorker(worker: Worker | undefined): void {
  if (!worker) return;
  worker.onmessage = null;
  worker.onerror = null;
  worker.terminate();
}
