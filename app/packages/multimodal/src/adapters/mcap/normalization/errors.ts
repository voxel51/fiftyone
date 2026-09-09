import { errorMessage } from "../../../utils/errors";

/** Typed boundary for readable message bytes that fail payload decoding. */
export class McapTopicDecodeError extends Error {
  readonly code = "message-decode-failed";
  readonly cause: unknown;
  readonly messageTimeNs: bigint;
  readonly payloadIdentity: string;
  readonly topic: string;

  constructor({
    cause,
    messageTimeNs,
    payloadIdentity,
    topic,
  }: {
    readonly cause: unknown;
    readonly messageTimeNs: bigint;
    readonly payloadIdentity: string;
    readonly topic: string;
  }) {
    super(errorMessage(cause, "Message decode failed"));
    this.name = "McapTopicDecodeError";
    this.cause = cause;
    this.messageTimeNs = messageTimeNs;
    this.payloadIdentity = payloadIdentity;
    this.topic = topic;
  }
}

/** Returns whether an error is a containable per-topic payload failure. */
export function isMcapTopicDecodeError(
  error: unknown,
): error is McapTopicDecodeError {
  return error instanceof McapTopicDecodeError;
}
