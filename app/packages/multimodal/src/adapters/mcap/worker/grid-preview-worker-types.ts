import type {
  McapGridPreviewDecodeRequest,
  McapGridPreviewResult,
} from "../grid-preview";
import type { McapPlaybackWorkerFetchParameters } from "./playback-worker-types";

/**
 * Payload for one high-level MCAP grid preview decode request.
 */
export type McapGridPreviewRequestPayload = McapGridPreviewDecodeRequest;

export type {
  McapGridPreviewFrame,
  McapGridPreviewResult,
} from "../grid-preview";

/**
 * RPC request envelope for the shared MCAP grid preview worker.
 */
export type McapGridPreviewWorkerRpcRequest = {
  readonly id: number;
  readonly payload: McapGridPreviewRequestPayload;
  readonly sourceKey: string;
  readonly type: "decodeGridPreview";
};

/**
 * Lifecycle and cancellation messages handled outside the scheduler queue.
 */
export type McapGridPreviewWorkerControlRequest =
  | {
      readonly payload: McapPlaybackWorkerFetchParameters;
      readonly type: "init";
    }
  | {
      readonly id: number;
      readonly type: "cancel";
    }
  | {
      readonly type: "dispose";
    };

/**
 * Any message accepted by the MCAP grid preview worker.
 */
export type McapGridPreviewWorkerRequest =
  | McapGridPreviewWorkerControlRequest
  | McapGridPreviewWorkerRpcRequest;

/**
 * Response envelope posted by the MCAP grid preview worker.
 */
export type McapGridPreviewWorkerResponse =
  | {
      readonly id: number;
      readonly ok: true;
      readonly result: McapGridPreviewResult;
    }
  | {
      readonly error: string;
      readonly id: number;
      readonly ok: false;
    };
