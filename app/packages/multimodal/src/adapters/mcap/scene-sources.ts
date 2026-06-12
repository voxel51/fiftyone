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
 * Scene-source types the MCAP adapter derives from a topic inventory.
 * The values double as tile types ("camera" → camera tile) and as the
 * keys tile settings use with `useSceneSourcesByType`.
 */
export const MCAP_SOURCE_TYPE = {
  CAMERA: "camera",
  LIDAR: "lidar",
  IMAGE_ANNOTATION: "image-annotation",
} as const;

export type McapSourceType =
  typeof MCAP_SOURCE_TYPE[keyof typeof MCAP_SOURCE_TYPE];

const CAMERA_SYNC_POLICY: McapStreamSyncPolicy = {
  mode: PlaybackSyncMode.LATEST,
  toleranceBeforeNs: 120_000_000n,
};

// Annotation streams typically arrive far slower than the camera frames
// they decorate (keyframe-rate annotations against full-rate video). A
// camera-sized tolerance leaves most ticks unresolved; widen the lookback
// so every tick has a current annotation message available.
const IMAGE_ANNOTATION_SYNC_POLICY: McapStreamSyncPolicy = {
  mode: PlaybackSyncMode.LATEST,
  toleranceBeforeNs: 1_500_000_000n,
};

const LIDAR_SYNC_POLICY: McapStreamSyncPolicy = {
  mode: PlaybackSyncMode.LATEST,
  toleranceBeforeNs: 200_000_000n,
};

const SYNC_POLICY_BY_TYPE: Record<McapSourceType, McapStreamSyncPolicy> = {
  [MCAP_SOURCE_TYPE.CAMERA]: CAMERA_SYNC_POLICY,
  [MCAP_SOURCE_TYPE.IMAGE_ANNOTATION]: IMAGE_ANNOTATION_SYNC_POLICY,
  [MCAP_SOURCE_TYPE.LIDAR]: LIDAR_SYNC_POLICY,
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
  const classified: Array<{ id: string; type: McapSourceType }> = [];
  for (const topic of topics) {
    const id = topicName(topic);
    if (!id) {
      continue;
    }
    const type = sourceTypeFor(topic);
    if (!type) {
      continue;
    }
    classified.push({ id, type });
  }

  const labelCounts = new Map<string, number>();
  for (const { id } of classified) {
    const label = shortTopicLabel(id);
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }

  // Prefer the short prefix-derived label; topics whose prefixes collide
  // (e.g. raw and rectified streams of one camera) keep their full topic
  // so source pickers stay unambiguous.
  return classified.map(({ id, type }) => {
    const short = shortTopicLabel(id);
    return {
      id,
      type,
      label: (labelCounts.get(short) ?? 0) > 1 ? displayTopic(id) : short,
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
    return MCAP_SOURCE_TYPE.CAMERA;
  }
  if (isPointCloudStream(topic)) {
    return MCAP_SOURCE_TYPE.LIDAR;
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
