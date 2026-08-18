import {
  SCENE_SOURCE_TYPE,
  STREAM_SYNC_MODE,
  type SceneSourceType,
  type StreamSyncPolicies,
  type StreamSyncPolicy,
} from "../ir";
import type { SceneSource } from "../ir";

const LATEST_POLICY: StreamSyncPolicy = { mode: STREAM_SYNC_MODE.LATEST };

const POLICY_BY_SOURCE_TYPE: Readonly<
  Partial<Record<SceneSourceType, StreamSyncPolicy>>
> = {
  [SCENE_SOURCE_TYPE.CAMERA_CALIBRATION]: LATEST_POLICY,
  [SCENE_SOURCE_TYPE.IMAGE]: LATEST_POLICY,
  [SCENE_SOURCE_TYPE.IMAGE_ANNOTATION]: LATEST_POLICY,
  [SCENE_SOURCE_TYPE.LOCATION]: LATEST_POLICY,
  [SCENE_SOURCE_TYPE.LOG]: LATEST_POLICY,
  [SCENE_SOURCE_TYPE.MAP_LAYER]: LATEST_POLICY,
  [SCENE_SOURCE_TYPE.POINT_CLOUD]: LATEST_POLICY,
  [SCENE_SOURCE_TYPE.POSE]: LATEST_POLICY,
  [SCENE_SOURCE_TYPE.SCENE_ANNOTATION]: LATEST_POLICY,
  // SCENE_SOURCE_TYPE.AUDIO is deliberately absent. These policies drive
  // playhead-demand frame selection in the buffered-read system; audio does
  // not participate in it at all — `useMcapAudioStream` reads the stream's
  // full time range once and decodes it up front (see that module's header).
  // An entry here would register audio for per-playhead selection it never
  // consumes, so omission is the correct behavior, not an oversight.
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
