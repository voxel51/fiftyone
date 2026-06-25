import type { PayloadDescriptor } from "../../decoders";
import type { StreamInventory } from "../../schemas/v1";
import {
  FOXGLOVE_COMPRESSED_IMAGE_PAYLOAD,
  FOXGLOVE_IMAGE_ANNOTATIONS_PAYLOAD,
  FOXGLOVE_POINT_CLOUD_PAYLOAD,
} from "./decoders/foxglove/protobuf/payloads";

/**
 * Supported MCAP topics that the adapter can preview or pair.
 */
export interface McapPreviewTopics {
  readonly annotations: readonly string[];
  readonly image: readonly string[];
  readonly pointCloud: readonly string[];
  readonly previewable: readonly string[];
}

/**
 * Classifies stream inventory into supported preview and pairing topic buckets.
 */
export function streamTopics(
  topics: readonly StreamInventory[],
): McapPreviewTopics {
  const image: string[] = [];
  const annotations: string[] = [];
  const pointCloud: string[] = [];

  for (const topic of topics) {
    const name = topicName(topic);
    if (!name) {
      continue;
    }

    if (isCompressedImageStream(topic)) {
      image.push(name);
    } else if (isPointCloudStream(topic)) {
      pointCloud.push(name);
    } else if (isImageAnnotationsStream(topic)) {
      annotations.push(name);
    }
  }

  return {
    annotations,
    image,
    pointCloud,
    previewable: [...image, ...pointCloud],
  };
}

/**
 * Returns the MCAP topic name stored on a stream inventory item.
 */
export function topicName(topic: StreamInventory): string {
  return topic.metadata["mcap.topic"] ?? topic.displayName ?? "";
}

/**
 * Returns whether a stream inventory item is a supported Foxglove compressed image.
 */
export function isCompressedImageStream(topic: StreamInventory): boolean {
  return hasPayload(topic, FOXGLOVE_COMPRESSED_IMAGE_PAYLOAD);
}

/**
 * Returns whether a stream inventory item is a supported Foxglove image annotation stream.
 */
export function isImageAnnotationsStream(topic: StreamInventory): boolean {
  return hasPayload(topic, FOXGLOVE_IMAGE_ANNOTATIONS_PAYLOAD);
}

/**
 * Returns whether a stream inventory item is a supported Foxglove point-cloud stream.
 */
export function isPointCloudStream(topic: StreamInventory): boolean {
  return hasPayload(topic, FOXGLOVE_POINT_CLOUD_PAYLOAD);
}

/**
 * Returns whether a stream inventory item exactly matches a payload descriptor.
 */
export function hasPayload(
  topic: StreamInventory,
  payload: PayloadDescriptor,
): boolean {
  const topicPayload = topic.payload;
  if (!topicPayload) {
    return false;
  }

  return (
    topicPayload.encoding === payload.encoding &&
    topicPayload.schema === payload.schema &&
    topicPayload.schemaEncoding === payload.schemaEncoding
  );
}
