import type { SceneSource } from "../../scene-inventory";
import { PlaybackSyncMode, type StreamInventory } from "../../schemas/v1";
import {
  isCompressedImageStream,
  isImageAnnotationsStream,
  isPointCloudStream,
  topicName,
} from "./stream-topics";
import { topicPrefix } from "./topic-matching";
import type { McapStreamSyncPolicies, McapStreamSyncPolicy } from "./types";

/**
 * Scene-source types the MCAP adapter derives from a topic inventory,
 * named for the payload they carry — not for the sensor that produced
 * it (a point cloud may come from lidar, radar, or a depth camera).
 * These are the keys tile settings use with `useSceneSourcesByType`;
 * the tile catalog maps them to the tile kinds that can render them.
 */
export const MCAP_SOURCE_TYPE = {
  IMAGE: "image",
  IMAGE_ANNOTATION: "image-annotation",
  POINT_CLOUD: "point-cloud",
} as const;

export type McapSourceType =
  typeof MCAP_SOURCE_TYPE[keyof typeof MCAP_SOURCE_TYPE];

// Latest-at-or-before with no tolerance = unbounded lookback: the read
// layer resolves the predecessor message however sparse the stream is
// (keyframe-rate annotations against full-rate video need no special
// case), and future data is never shown. Kept per-type so any future
// tuning (limits, modes) stays a one-line change.
const LATEST_SYNC_POLICY: McapStreamSyncPolicy = {
  mode: PlaybackSyncMode.LATEST,
};

const SYNC_POLICY_BY_TYPE: Record<McapSourceType, McapStreamSyncPolicy> = {
  [MCAP_SOURCE_TYPE.IMAGE]: LATEST_SYNC_POLICY,
  [MCAP_SOURCE_TYPE.IMAGE_ANNOTATION]: LATEST_SYNC_POLICY,
  [MCAP_SOURCE_TYPE.POINT_CLOUD]: LATEST_SYNC_POLICY,
};

/**
 * Derives the scene inventory from MCAP topic metadata. Topics are
 * classified by payload identity (Foxglove compressed image, point
 * cloud, image annotations); unsupported topics are omitted. Inventory
 * order is preserved so source pickers and "first source of a type"
 * defaults stay deterministic per file.
 */
export function mcapSceneSources(
  topics: readonly StreamInventory[]
): readonly SceneSource[] {
  const classified: Array<{
    id: string;
    type: McapSourceType;
    recordCount?: number;
  }> = [];
  for (const topic of topics) {
    const id = topicName(topic);
    if (!id) {
      continue;
    }
    const type = sourceTypeFor(topic);
    if (!type) {
      continue;
    }
    const recordCount = Number(topic.recordCount);
    classified.push({
      id,
      type,
      ...(Number.isFinite(recordCount) && recordCount >= 0
        ? { recordCount }
        : {}),
    });
  }

  const labelCounts = new Map<string, number>();
  for (const { id } of classified) {
    const label = shortTopicLabel(id);
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }

  // Prefer the short prefix-derived label; topics whose prefixes collide
  // (e.g. raw and rectified streams of one camera) keep their full topic
  // so source pickers stay unambiguous.
  return classified.map(({ id, type, recordCount }) => {
    const short = shortTopicLabel(id);
    return {
      id,
      type,
      label: (labelCounts.get(short) ?? 0) > 1 ? displayTopic(id) : short,
      ...(recordCount !== undefined ? { recordCount } : {}),
    };
  });
}

/**
 * Per-topic playback sync policies for a derived scene inventory. The
 * policy is chosen by source type, so any file gets sensible defaults
 * without per-topic configuration.
 */
export function mcapStreamPolicies(
  sources: readonly SceneSource[]
): McapStreamSyncPolicies {
  const policies: Record<string, McapStreamSyncPolicy> = {};
  for (const source of sources) {
    const policy = SYNC_POLICY_BY_TYPE[source.type as McapSourceType];
    if (policy) {
      policies[source.id] = policy;
    }
  }
  return policies;
}

function sourceTypeFor(topic: StreamInventory): McapSourceType | null {
  if (isCompressedImageStream(topic)) {
    return MCAP_SOURCE_TYPE.IMAGE;
  }
  if (isPointCloudStream(topic)) {
    return MCAP_SOURCE_TYPE.POINT_CLOUD;
  }
  if (isImageAnnotationsStream(topic)) {
    return MCAP_SOURCE_TYPE.IMAGE_ANNOTATION;
  }
  return null;
}

// "/CAM_FRONT/image_rect_compressed" → "CAM_FRONT";
// "/CAM_FRONT/annotations" → "CAM_FRONT/annotations".
function shortTopicLabel(id: string): string {
  return displayTopic(topicPrefix(id) || id);
}

function displayTopic(id: string): string {
  return id.replace(/^\//, "");
}
