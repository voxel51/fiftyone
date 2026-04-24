// TODO: define the worker message protocol.

export const WORKER_MESSAGE_TYPE = Object.freeze({
  ERROR: "multimodal.worker.error",
  UNHANDLED: "multimodal.worker.unhandled",
} as const);

export type WorkerMessageType =
  typeof WORKER_MESSAGE_TYPE[keyof typeof WORKER_MESSAGE_TYPE];

export type WorkerPayloadValue =
  | string
  | number
  | boolean
  | null
  | readonly WorkerPayloadValue[]
  | { readonly [field: string]: WorkerPayloadValue };

export type WorkerPayload = {
  readonly [field: string]: WorkerPayloadValue;
};

/**
 * Base envelope shared by main-thread and worker-thread messages.
 *
 * Payload fields are intentionally broad until the worker protocol is final.
 */
export interface WorkerMessageEnvelope {
  readonly type: string;
  readonly payload?: WorkerPayload;
}

export interface WorkerErrorMessage {
  readonly type: typeof WORKER_MESSAGE_TYPE.ERROR;
  readonly payload: {
    readonly message: string;
  };
}

export interface WorkerUnhandledMessage {
  readonly type: typeof WORKER_MESSAGE_TYPE.UNHANDLED;
  readonly payload: {
    readonly type: string;
  };
}

/**
 * Message union sent from the main thread to the multimodal worker.
 */
export type MainToWorkerMessage = WorkerMessageEnvelope;

/**
 * Message union sent from the multimodal worker back to the main thread.
 */
export type WorkerToMainMessage = WorkerErrorMessage | WorkerUnhandledMessage;

export type WorkerMessageCandidate = WorkerMessageEnvelope | WorkerPayloadValue;
