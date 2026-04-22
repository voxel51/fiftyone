// TODO: define the worker message protocol.

/**
 * Opaque base envelope shared by main-thread and worker-thread messages.
 */
export interface WorkerMessageEnvelope {
  readonly type: string;
  readonly payload?: unknown;
}

/**
 * Message union sent from the main thread to the multimodal worker.
 */
export type MainToWorkerMessage = WorkerMessageEnvelope;

/**
 * Message union sent from the multimodal worker back to the main thread.
 */
export type WorkerToMainMessage = WorkerMessageEnvelope;
