import {
  SCENE_SOURCE_TYPE,
  STREAM_SYNC_MODE,
  type SceneSourceType,
  type StreamSyncPolicies,
  type StreamSyncPolicy,
} from "../ir";
import type { SceneSource } from "../ir";

const LATEST_POLICY: StreamSyncPolicy = { mode: STREAM_SYNC_MODE.LATEST };

// Total by construction: every scene source type resolves to a policy, so a
// new type cannot silently fall through to the read layer's implicit default.
// Mirrors `SYNC_POLICY_BY_TYPE` in the MCAP resource client, which is already
// total — the two must agree.
const POLICY_BY_SOURCE_TYPE: Readonly<
  Record<SceneSourceType, StreamSyncPolicy>
> = {
  [SCENE_SOURCE_TYPE.AUDIO]: LATEST_POLICY,
  [SCENE_SOURCE_TYPE.CAMERA_CALIBRATION]: LATEST_POLICY,
  [SCENE_SOURCE_TYPE.IMAGE]: LATEST_POLICY,
  [SCENE_SOURCE_TYPE.IMAGE_ANNOTATION]: LATEST_POLICY,
  [SCENE_SOURCE_TYPE.LOCATION]: LATEST_POLICY,
  [SCENE_SOURCE_TYPE.LOG]: LATEST_POLICY,
  [SCENE_SOURCE_TYPE.MAP_LAYER]: LATEST_POLICY,
  [SCENE_SOURCE_TYPE.POINT_CLOUD]: LATEST_POLICY,
  [SCENE_SOURCE_TYPE.POSE]: LATEST_POLICY,
  [SCENE_SOURCE_TYPE.SCENE_ANNOTATION]: LATEST_POLICY,
};

/** Derives format-neutral playback selection policies from scene semantics. */
export function streamSyncPoliciesForSceneSources(
  sources: readonly SceneSource[],
): StreamSyncPolicies {
  return Object.fromEntries(
    sources.flatMap((source) => {
      const policy = POLICY_BY_SOURCE_TYPE[source.type as SceneSourceType];
      return policy ? [[source.id, policy] as const] : [];
    }),
  );
}
