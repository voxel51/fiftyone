import type { McapResourceClient } from "../types";
import {
  MCAP_PLAYBACK_WORKER_PRIORITY,
  type McapPlaybackWorkerPriority,
  type McapPlaybackWorkerRpcRequest,
  type McapPlaybackWorkerRequestPayloadByType,
  type McapPlaybackWorkerResultByType,
  type McapPlaybackWorkerRpcType,
  type McapPlaybackWorkerStreamItemByType,
  type McapPlaybackWorkerStreamType,
  type McapPlaybackWorkerUnaryType,
} from "./playback-worker-types";

/**
 * Worker operation descriptor for one unary MCAP RPC.
 */
export type McapPlaybackWorkerUnaryOperation<
  Type extends McapPlaybackWorkerUnaryType
> = {
  readonly kind: "unary";
  readonly priority: McapPlaybackWorkerPriority;
  run(
    client: McapResourceClient,
    payload: McapPlaybackWorkerRequestPayloadByType[Type]
  ): Promise<McapPlaybackWorkerResultByType[Type]>;
};

/**
 * Worker operation descriptor for one streaming MCAP RPC.
 */
export type McapPlaybackWorkerStreamOperation<
  Type extends McapPlaybackWorkerStreamType
> = {
  readonly kind: "stream";
  readonly priority: McapPlaybackWorkerPriority;
  run(
    client: McapResourceClient,
    payload: McapPlaybackWorkerRequestPayloadByType[Type]
  ): AsyncGenerator<McapPlaybackWorkerStreamItemByType[Type], void, void>;
};

/**
 * Union of worker operation descriptors keyed by RPC type.
 */
export type McapPlaybackWorkerOperation<
  Type extends McapPlaybackWorkerRpcType = McapPlaybackWorkerRpcType
> = Type extends McapPlaybackWorkerUnaryType
  ? McapPlaybackWorkerUnaryOperation<Type>
  : Type extends McapPlaybackWorkerStreamType
  ? McapPlaybackWorkerStreamOperation<Type>
  : never;

type McapPlaybackWorkerOperationMap = {
  readonly [Type in McapPlaybackWorkerRpcType]: McapPlaybackWorkerOperation<Type>;
};

/**
 * Single source of truth for MCAP worker dispatch and scheduling priority.
 */
export const MCAP_PLAYBACK_WORKER_OPERATIONS: McapPlaybackWorkerOperationMap = {
  readDecodedMessages: {
    kind: "stream",
    priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
    run: (client, payload) => client.readDecodedMessages(payload),
  },
  readSynchronizedMessageBatch: {
    kind: "unary",
    priority: MCAP_PLAYBACK_WORKER_PRIORITY.PLAYBACK_BATCH,
    run: (client, payload) => client.readSynchronizedMessageBatch(payload),
  },
  readSynchronizedMessages: {
    kind: "unary",
    priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
    run: (client, payload) => client.readSynchronizedMessages(payload),
  },
  readTimelineRange: {
    kind: "unary",
    priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
    run: (client, payload) => client.readTimelineRange(payload),
  },
};

/**
 * Returns the worker operation descriptor for one RPC type.
 */
export function mcapPlaybackWorkerOperation<
  Type extends McapPlaybackWorkerRpcType
>(type: Type): McapPlaybackWorkerOperation<Type> {
  return MCAP_PLAYBACK_WORKER_OPERATIONS[
    type
  ] as unknown as McapPlaybackWorkerOperation<Type>;
}

/**
 * Narrows a scheduled worker request to the streaming operation family.
 */
export function isMcapPlaybackWorkerStreamRequest(
  message: McapPlaybackWorkerRpcRequest
): message is McapPlaybackWorkerRpcRequest<McapPlaybackWorkerStreamType> {
  return mcapPlaybackWorkerOperation(message.type).kind === "stream";
}

/**
 * Runs one unary MCAP worker request against a resource client.
 */
export function runMcapPlaybackWorkerUnaryRequest(
  client: McapResourceClient,
  message: McapPlaybackWorkerRpcRequest<McapPlaybackWorkerUnaryType>
): Promise<McapPlaybackWorkerResultByType[McapPlaybackWorkerUnaryType]> {
  const operation = mcapPlaybackWorkerOperation(
    message.type
  ) as McapPlaybackWorkerUnaryOperation<McapPlaybackWorkerUnaryType>;

  return operation.run(client, message.payload as never);
}

/**
 * Streams results for one streaming MCAP worker request.
 */
export async function* runMcapPlaybackWorkerStreamRequest(
  client: McapResourceClient,
  message: McapPlaybackWorkerRpcRequest<McapPlaybackWorkerStreamType>
): AsyncGenerator<
  McapPlaybackWorkerStreamItemByType[McapPlaybackWorkerStreamType],
  void,
  void
> {
  const operation = mcapPlaybackWorkerOperation(
    message.type
  ) as McapPlaybackWorkerStreamOperation<McapPlaybackWorkerStreamType>;

  yield* operation.run(client, message.payload as never);
}
