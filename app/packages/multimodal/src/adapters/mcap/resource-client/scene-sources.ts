import {
  SCENE_SOURCE_METADATA,
  SCENE_SOURCE_TYPE,
  type SceneSource,
  type SceneSourceType,
} from "../../../ir/index";
import {
  PlaybackSyncMode,
  type StreamInventory,
} from "../../../schemas/v1/index";
import {
  chooseCalibrationStream,
  streamPrefix,
} from "../../../stream-selection/index";
import {
  isCameraCalibrationStream,
  isGridStream,
  isImageAnnotationsStream,
  isImageStream,
  isLocationFixStream,
  isLogStream,
  isPointCloudStream,
  isPoseStream,
  isSceneUpdateStream,
  topicName,
} from "./stream-topics";
import type {
  McapStreamSyncPolicies,
  McapStreamSyncPolicy,
} from "../contracts/index";

// Latest-at-or-before with no tolerance = unbounded lookback: the read
// layer resolves the predecessor message however sparse the stream is
// (keyframe-rate annotations against full-rate video need no special
// case), and future data is never shown. Kept per-type so any future
// tuning (limits, modes) stays a one-line change.
const LATEST_SYNC_POLICY: McapStreamSyncPolicy = {
  mode: PlaybackSyncMode.LATEST,
};

const SYNC_POLICY_BY_TYPE: Record<SceneSourceType, McapStreamSyncPolicy> = {
  [SCENE_SOURCE_TYPE.CAMERA_CALIBRATION]: LATEST_SYNC_POLICY,
  [SCENE_SOURCE_TYPE.IMAGE]: LATEST_SYNC_POLICY,
  [SCENE_SOURCE_TYPE.IMAGE_ANNOTATION]: LATEST_SYNC_POLICY,
  [SCENE_SOURCE_TYPE.LOCATION]: LATEST_SYNC_POLICY,
  [SCENE_SOURCE_TYPE.LOG]: LATEST_SYNC_POLICY,
  // Unbounded lookback is what makes static maps work: a one-shot /map
  // message published at file start stays resolvable for the whole run.
  [SCENE_SOURCE_TYPE.MAP_LAYER]: LATEST_SYNC_POLICY,
  [SCENE_SOURCE_TYPE.POINT_CLOUD]: LATEST_SYNC_POLICY,
  [SCENE_SOURCE_TYPE.POSE]: LATEST_SYNC_POLICY,
  [SCENE_SOURCE_TYPE.SCENE_ANNOTATION]: LATEST_SYNC_POLICY,
};

/**
 * Derives the scene inventory from MCAP topic metadata. Topics are
 * classified by payload identity (image, point
 * cloud, image annotations); unsupported topics are omitted. Inventory
 * order is preserved so source pickers and "first source of a type"
 * defaults stay deterministic per file.
 */
export function mcapSceneSources(
  topics: readonly StreamInventory[],
): readonly SceneSource[] {
  const classified: Array<{
    id: string;
    type: SceneSourceType;
    recordCount?: number;
  }> = [];
  for (const topic of topics) {
    const id = topicName(topic);
    if (!id) {
      continue;
    }
    const type = mcapSourceTypeForTopic(topic);
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

  const calibrationTopics = classified
    .filter(({ type }) => type === SCENE_SOURCE_TYPE.CAMERA_CALIBRATION)
    .map(({ id }) => id);

  // Prefer the short prefix-derived label; topics whose prefixes collide
  // (e.g. raw and rectified streams of one camera) keep their full topic
  // so source pickers stay unambiguous.
  return classified.map(({ id, type, recordCount }) => {
    const short = shortTopicLabel(id);
    const calibrationTopic =
      type === SCENE_SOURCE_TYPE.IMAGE
        ? chooseCalibrationStream(id, calibrationTopics)
        : null;
    return {
      id,
      type,
      label: (labelCounts.get(short) ?? 0) > 1 ? displayTopic(id) : short,
      sourceName: id,
      ...(calibrationTopic
        ? {
            metadata: {
              [SCENE_SOURCE_METADATA.CALIBRATION_STREAM_ID]: calibrationTopic,
            },
          }
        : {}),
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
  sources: readonly SceneSource[],
): McapStreamSyncPolicies {
  const policies: Record<string, McapStreamSyncPolicy> = {};
  for (const source of sources) {
    const policy = SYNC_POLICY_BY_TYPE[source.type as SceneSourceType];
    if (policy) {
      policies[source.id] = policy;
    }
  }
  return policies;
}

export function mcapSourceTypeForTopic(
  topic: StreamInventory,
): SceneSourceType | null {
  if (isImageStream(topic)) {
    return SCENE_SOURCE_TYPE.IMAGE;
  }
  if (isPointCloudStream(topic)) {
    return SCENE_SOURCE_TYPE.POINT_CLOUD;
  }
  if (isImageAnnotationsStream(topic)) {
    return SCENE_SOURCE_TYPE.IMAGE_ANNOTATION;
  }
  if (isSceneUpdateStream(topic)) {
    return SCENE_SOURCE_TYPE.SCENE_ANNOTATION;
  }
  if (isGridStream(topic)) {
    return SCENE_SOURCE_TYPE.MAP_LAYER;
  }
  if (isCameraCalibrationStream(topic)) {
    return SCENE_SOURCE_TYPE.CAMERA_CALIBRATION;
  }
  if (isPoseStream(topic)) {
    return SCENE_SOURCE_TYPE.POSE;
  }
  if (isLocationFixStream(topic)) {
    return SCENE_SOURCE_TYPE.LOCATION;
  }
  if (isLogStream(topic)) {
    return SCENE_SOURCE_TYPE.LOG;
  }
  return null;
}

// "/CAM_FRONT/image_rect_compressed" → "CAM_FRONT";
// "/CAM_FRONT/annotations" → "CAM_FRONT/annotations".
function shortTopicLabel(id: string): string {
  return displayTopic(streamPrefix(id) || id);
}

function displayTopic(id: string): string {
  return id.replace(/^\//, "");
}
