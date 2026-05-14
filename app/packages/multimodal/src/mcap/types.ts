import type { ByteSourceDescriptor, DecodeResourceResult } from "../client";
import type { PlaybackSyncMode } from "../schemas/v1";

/**
 * MCAP timestamp source selected by the playback clock/time track.
 */
export const MCAP_TIMESTAMP_SOURCE = Object.freeze({
  HEADER_TIME: "header",
  LOG_TIME: "log",
  PUBLISH_TIME: "publish",
} as const);

/**
 * Supported MCAP timestamp sources used to derive playback sync time.
 */
export type McapTimestampSource =
  typeof MCAP_TIMESTAMP_SOURCE[keyof typeof MCAP_TIMESTAMP_SOURCE];

/**
 * Stream-local playback sync policy. The mode comes from playback.proto; the
 * controller/UI owns choosing it per stream.
 */
export interface McapStreamSyncPolicy {
  readonly limit?: number;
  readonly mode?: PlaybackSyncMode;
  readonly toleranceAfterNs?: bigint;
  readonly toleranceBeforeNs?: bigint;
}

/**
 * Per-topic playback sync policy map keyed by MCAP topic.
 */
export type McapStreamSyncPolicies = Readonly<
  Record<string, McapStreamSyncPolicy>
>;

/**
 * Sync policy after defaults have been resolved into concrete time bounds.
 */
export interface McapResolvedStreamSyncPolicy {
  readonly endTimeNs: bigint;
  readonly limit: number;
  readonly mode: PlaybackSyncMode;
  readonly startTimeNs: bigint;
}

/**
 * MCAP source identity for byte-range reads.
 */
export type McapSourceDescriptor = ByteSourceDescriptor;

/**
 * Request for decoding an MCAP message window.
 */
export interface McapReadDecodedMessagesRequest {
  readonly endTimeNs?: bigint;
  readonly limit?: number;
  readonly source: McapSourceDescriptor;
  readonly startTimeNs?: bigint;
  readonly timestampSource?: McapTimestampSource;
  readonly topics?: readonly string[];
}

/**
 * Request for reading raw MCAP message timestamps without decoding payloads.
 */
export type McapReadMessageTimesRequest = McapReadDecodedMessagesRequest;

/**
 * Request for playback timeline anchors from a single MCAP topic.
 */
export interface McapReadTimelineAnchorsRequest {
  readonly endTimeNs?: bigint;
  readonly limit?: number;
  readonly source: McapSourceDescriptor;
  readonly startTimeNs?: bigint;
  readonly timestampSource?: McapTimestampSource;
  readonly topic: string;
}

/**
 * Request for a playback-oriented synchronized message window.
 */
export interface McapReadSynchronizedMessagesRequest {
  readonly anchorTimeNs: bigint;
  readonly defaultStreamPolicy?: McapStreamSyncPolicy;
  readonly source: McapSourceDescriptor;
  readonly streamPolicies?: McapStreamSyncPolicies;
  readonly timestampSource?: McapTimestampSource;
  readonly topics: readonly string[];
}

/**
 * Batch request for playback prefetchers that need multiple synchronized
 * windows from the same source and topic set.
 */
export interface McapReadSynchronizedMessageBatchRequest
  extends Omit<McapReadSynchronizedMessagesRequest, "anchorTimeNs"> {
  readonly anchorTimeNs: readonly bigint[];
}

/**
 * Decoded MCAP message with playback identity and decoder output.
 */
export interface McapDecodedMessage {
  readonly channelId: number;
  readonly decoded: DecodeResourceResult;
  readonly logTimeNs: bigint;
  readonly publishTimeNs: bigint;
  readonly sequence: number;
  readonly syncTimeNs: bigint;
  readonly timestampSource: McapTimestampSource;
  readonly topic: string;
}

/**
 * Raw MCAP message timestamp used by playback timeline construction.
 */
export interface McapMessageTime {
  readonly channelId: number;
  readonly logTimeNs: bigint;
  readonly publishTimeNs: bigint;
  readonly sequence: number;
  readonly syncTimeNs: bigint;
  readonly timestampSource: McapTimestampSource;
  readonly topic: string;
}

/**
 * Synchronized MCAP playback window grouped by topic.
 */
export interface McapSynchronizedMessageWindow {
  readonly anchorTimeNs: bigint;
  readonly endTimeNs: bigint;
  readonly messages: readonly McapDecodedMessage[];
  readonly messagesByTopic: Readonly<
    Record<string, readonly McapDecodedMessage[]>
  >;
  readonly startTimeNs: bigint;
  readonly streamPolicies: Readonly<
    Record<string, McapResolvedStreamSyncPolicy>
  >;
  readonly timestampSource: McapTimestampSource;
}

/**
 * MCAP-specific resource client.
 */
export interface McapResourceClient {
  dispose(): void;

  readDecodedMessages(
    request: McapReadDecodedMessagesRequest
  ): AsyncGenerator<McapDecodedMessage, void, void>;

  readMessageTimes(
    request: McapReadMessageTimesRequest
  ): AsyncGenerator<McapMessageTime, void, void>;

  readTimelineAnchors(
    request: McapReadTimelineAnchorsRequest
  ): Promise<readonly bigint[]>;

  readSynchronizedMessages(
    request: McapReadSynchronizedMessagesRequest
  ): Promise<McapSynchronizedMessageWindow>;

  readSynchronizedMessageBatch(
    request: McapReadSynchronizedMessageBatchRequest
  ): Promise<readonly McapSynchronizedMessageWindow[]>;
}
