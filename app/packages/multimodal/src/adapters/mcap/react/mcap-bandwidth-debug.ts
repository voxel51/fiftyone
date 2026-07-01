import { VISUALIZATION_KIND } from "../../../visualization";
import type { McapFrameTransformSet } from "../frame-transform-types";
import type {
  McapDecodedMessage,
  McapSynchronizedMessageWindow,
} from "../types";
import {
  isMcapLatencyDebugEnabled,
  recordMcapBandwidthSample,
} from "./mcap-latency-debug";

export type McapBandwidthOperation =
  | "background-lookahead"
  | "current-frame"
  | "loopback-lookahead"
  | "playback-prefetch"
  | "startup-lookahead"
  | "transform-bootstrap"
  | "transform-current-window"
  | "transform-runway";

interface RecordMessageWindowBandwidthOptions {
  readonly operation: McapBandwidthOperation;
  readonly requestId?: string;
  readonly requestedTicks: number;
  readonly requestedTopics: number;
  readonly windows: readonly McapSynchronizedMessageWindow[];
}

interface RecordFrameTransformBandwidthOptions {
  readonly operation: McapBandwidthOperation;
  readonly set: McapFrameTransformSet;
}

interface MessageBucket {
  decodedBytes: number;
  occurrences: number;
  rawBytes: number;
  topic: string;
  uniqueMessages: number;
}

export function recordMcapMessageWindowBandwidth({
  operation,
  requestId: callerRequestId,
  requestedTicks,
  requestedTopics,
  windows,
}: RecordMessageWindowBandwidthOptions): void {
  if (!isMcapLatencyDebugEnabled()) return;

  const requestId = callerRequestId ?? bandwidthRequestId(operation);
  const occurrences = new Map<string, number>();
  const messagesByKey = new Map<string, McapDecodedMessage>();
  for (const window of windows) {
    for (const messages of Object.values(window.messagesByTopic)) {
      for (const message of messages ?? []) {
        const key = messageBandwidthKey(message);
        occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
        messagesByKey.set(key, message);
      }
    }
  }

  if (messagesByKey.size === 0) {
    recordMcapBandwidthSample({
      category: "empty",
      decodedBytes: 0,
      operation,
      phase: operationPhase(operation),
      rawBytes: 0,
      requestId,
      requestedTicks,
      requestedTopics,
      uniqueMessages: 0,
      windows: windows.length,
    });
    return;
  }

  const buckets = new Map<string, MessageBucket>();
  for (const [key, message] of messagesByKey) {
    const category = categoryForMessage(message);
    const bucketKey = `${category}\u0000${message.topic}`;
    const bucket = buckets.get(bucketKey) ?? {
      decodedBytes: 0,
      occurrences: 0,
      rawBytes: 0,
      topic: message.topic,
      uniqueMessages: 0,
    };
    bucket.decodedBytes += decodedBytesForMessage(message);
    bucket.occurrences += occurrences.get(key) ?? 1;
    bucket.rawBytes += message.encodedPayloadBytes ?? 0;
    bucket.uniqueMessages += 1;
    buckets.set(bucketKey, bucket);
  }

  for (const [bucketKey, bucket] of buckets) {
    const [category] = bucketKey.split("\u0000");
    recordMcapBandwidthSample({
      category,
      decodedBytes: bucket.decodedBytes,
      messages: bucket.uniqueMessages,
      occurrences: bucket.occurrences,
      operation,
      phase: operationPhase(operation),
      rawBytes: bucket.rawBytes,
      requestId,
      requestedTicks,
      requestedTopics,
      topic: bucket.topic,
      uniqueMessages: bucket.uniqueMessages,
      windows: windows.length,
    });
  }
}

export function recordMcapFrameTransformBandwidth({
  operation,
  set,
}: RecordFrameTransformBandwidthOptions): void {
  if (!isMcapLatencyDebugEnabled()) return;

  const requestId = bandwidthRequestId(operation);
  const topicStats = set.topicStats?.length
    ? set.topicStats
    : fallbackTransformTopicStats(set);

  topicStats.forEach((stats) => {
    recordMcapBandwidthSample({
      category: "transform",
      decodedBytes: 0,
      messages: stats.messageCount,
      operation,
      phase: operationPhase(operation),
      rawBytes: stats.encodedPayloadBytes,
      requestId,
      samples: set.samples.length,
      topic: stats.topic,
      uniqueMessages: stats.messageCount,
    });
  });
}

function messageBandwidthKey(message: McapDecodedMessage): string {
  return [
    message.topic,
    message.channelId,
    message.sequence,
    message.timelineTimeNs.toString(),
    message.encodedPayloadBytes ?? 0,
  ].join(":");
}

function categoryForMessage(message: McapDecodedMessage): string {
  const kind = message.decoded.output.visualization?.kind;
  if (kind === VISUALIZATION_KIND.ENCODED_IMAGE) {
    return "image";
  }
  if (kind === VISUALIZATION_KIND.IMAGE_ANNOTATIONS) {
    return "image-annotations";
  }
  if (kind === VISUALIZATION_KIND.POINT_CLOUD) {
    return pointCloudCategoryForTopic(message.topic);
  }
  if (kind === VISUALIZATION_KIND.SCENE_UPDATE) {
    return "scene-annotations";
  }
  if (!kind) {
    return "metadata";
  }

  return "unknown";
}

function pointCloudCategoryForTopic(topic: string): string {
  const lowerTopic = topic.toLowerCase();
  if (lowerTopic.includes("radar")) return "radar-point-cloud";
  if (
    lowerTopic.includes("lidar") ||
    lowerTopic.includes("velodyne") ||
    lowerTopic.includes("ouster") ||
    lowerTopic.includes("hesai") ||
    lowerTopic.includes("robosense") ||
    lowerTopic.includes("livox")
  ) {
    return "lidar-point-cloud";
  }

  return "point-cloud";
}

function decodedBytesForMessage(message: McapDecodedMessage): number {
  return message.decoded.output.resourceHints?.sizeBytes ?? 0;
}

function bandwidthRequestId(operation: McapBandwidthOperation): string {
  return `${operation}:${Date.now().toString(36)}:${Math.random()
    .toString(36)
    .slice(2)}`;
}

function operationPhase(operation: McapBandwidthOperation): string {
  if (
    operation === "startup-lookahead" ||
    operation === "transform-bootstrap"
  ) {
    return "startup";
  }
  if (
    operation === "current-frame" ||
    operation === "transform-current-window"
  ) {
    return "current-frame";
  }
  if (
    operation === "background-lookahead" ||
    operation === "transform-runway"
  ) {
    return "background";
  }

  return "playback";
}

function fallbackTransformTopicStats(set: McapFrameTransformSet) {
  const topics = set.topics?.length ? set.topics : ["transforms"];
  const topicBytes = splitCountEvenly(
    set.encodedPayloadBytes ?? 0,
    topics.length,
  );
  const topicMessages = splitCountEvenly(set.messageCount ?? 0, topics.length);
  return topics.map((topic, index) => ({
    encodedPayloadBytes: topicBytes[index] ?? 0,
    messageCount: topicMessages[index] ?? 0,
    topic,
  }));
}

function splitCountEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, index) =>
    index < remainder ? base + 1 : base,
  );
}
