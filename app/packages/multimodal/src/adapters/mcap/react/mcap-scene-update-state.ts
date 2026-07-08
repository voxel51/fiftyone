import { VISUALIZATION_KIND } from "../../../visualization";
import type {
  SceneEntityVisualization,
  SceneUpdateVisualization,
} from "../../../decoders";

export interface McapSceneUpdateDelta {
  readonly timeNs: bigint;
  readonly update: SceneUpdateVisualization;
}

interface SceneEntityRecord {
  readonly entity: SceneEntityVisualization;
  readonly expiresAtNs?: bigint;
  readonly updatedAtNs: bigint;
}

/**
 * Folds scene-update deltas into a render snapshot at one playhead time.
 *
 * SceneUpdate and ROS MarkerArray are state-update streams: ADD/MODIFY
 * upserts by id, DELETE removes by id, DELETEALL clears the topic, and
 * lifetimes expire relative to the message/entity timestamp. The renderer
 * wants a full entity snapshot, so this fold is intentionally pure and
 * deterministic; callers can cache or rebuild around it depending on the
 * playback path.
 *
 * Within one SceneUpdate message, deletions are applied before entity upserts.
 * The wire shape stores them in separate arrays, so true interleaving order is
 * unavailable. This ordering supports the common "clear all, then publish a
 * full replacement snapshot" pattern while remaining stable for Foxglove and
 * ROS marker streams.
 */
export function sceneUpdateSnapshotAt(
  deltas: readonly McapSceneUpdateDelta[],
  timeNs: bigint,
): SceneUpdateVisualization {
  const state = new Map<string, SceneEntityRecord>();

  for (const delta of [...deltas].sort(compareSceneUpdateDeltas)) {
    if (delta.timeNs > timeNs) {
      break;
    }

    expireEntities(state, timeNs);
    applySceneUpdateDelta(state, delta, timeNs);
  }
  expireEntities(state, timeNs);

  return {
    deletions: [],
    entities: [...state.values()].map((record) => record.entity),
    kind: VISUALIZATION_KIND.SCENE_UPDATE,
  };
}

function applySceneUpdateDelta(
  state: Map<string, SceneEntityRecord>,
  { timeNs, update }: McapSceneUpdateDelta,
  targetTimeNs: bigint,
): void {
  for (const deletion of update.deletions) {
    const deletionTimeNs = deletion.timestampNs ?? timeNs;
    if (deletionTimeNs > targetTimeNs) {
      continue;
    }
    if (deletion.type === "all") {
      state.clear();
    } else {
      state.delete(deletion.id);
    }
  }

  for (const entity of update.entities) {
    const updatedAtNs = entity.timestampNs ?? timeNs;
    if (updatedAtNs > targetTimeNs) {
      continue;
    }
    const expiresAtNs =
      entity.lifetimeNs !== undefined && entity.lifetimeNs > 0n
        ? updatedAtNs + entity.lifetimeNs
        : undefined;
    if (expiresAtNs !== undefined && expiresAtNs <= targetTimeNs) {
      state.delete(entity.id);
      continue;
    }

    state.set(entity.id, {
      entity,
      ...(expiresAtNs !== undefined ? { expiresAtNs } : {}),
      updatedAtNs,
    });
  }
}

function expireEntities(
  state: Map<string, SceneEntityRecord>,
  targetTimeNs: bigint,
): void {
  for (const [id, record] of state) {
    if (
      record.expiresAtNs !== undefined &&
      record.expiresAtNs <= targetTimeNs
    ) {
      state.delete(id);
    }
  }
}

function compareSceneUpdateDeltas(
  left: McapSceneUpdateDelta,
  right: McapSceneUpdateDelta,
): number {
  if (left.timeNs === right.timeNs) {
    return 0;
  }
  return left.timeNs < right.timeNs ? -1 : 1;
}
