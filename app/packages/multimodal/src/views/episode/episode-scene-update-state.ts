import { VISUALIZATION_KIND } from "../../visualization";
import type {
  SceneEntityVisualization,
  SceneUpdateVisualization,
} from "../../decoders";

export interface EpisodeSceneUpdateDelta {
  readonly timeNs: bigint;
  readonly update: SceneUpdateVisualization;
}

interface SceneEntityRecord {
  readonly entity: SceneEntityVisualization;
  readonly updatedAtNs: bigint;
}

const SORTED_DELTAS_CACHE = new WeakMap<
  readonly EpisodeSceneUpdateDelta[],
  readonly EpisodeSceneUpdateDelta[]
>();

/**
 * Folds scene-update deltas into a render snapshot at one playhead time.
 *
 * SceneUpdate and ROS MarkerArray are state-update streams: ADD/MODIFY
 * upserts by id, DELETE removes by id, DELETEALL clears the stream, and
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
  deltas: readonly EpisodeSceneUpdateDelta[],
  timeNs: bigint,
): SceneUpdateVisualization {
  const state = new Map<string, SceneEntityRecord>();

  for (const delta of sortedSceneUpdateDeltas(deltas)) {
    if (delta.timeNs > timeNs) {
      break;
    }

    applySceneUpdateDelta(state, delta, timeNs);
  }

  return {
    deletions: [],
    entities: [...state.values()].map((record) => record.entity),
    kind: VISUALIZATION_KIND.SCENE_UPDATE,
  };
}

function sortedSceneUpdateDeltas(
  deltas: readonly EpisodeSceneUpdateDelta[],
): readonly EpisodeSceneUpdateDelta[] {
  const cached = SORTED_DELTAS_CACHE.get(deltas);
  if (cached) {
    return cached;
  }

  const sorted = isSortedByTime(deltas)
    ? deltas
    : [...deltas].sort(compareSceneUpdateDeltas);
  SORTED_DELTAS_CACHE.set(deltas, sorted);
  return sorted;
}

function isSortedByTime(deltas: readonly EpisodeSceneUpdateDelta[]): boolean {
  for (let index = 1; index < deltas.length; index++) {
    const previous = deltas[index - 1];
    const current = deltas[index];
    if (!previous || !current) {
      continue;
    }
    if (previous.timeNs > current.timeNs) {
      return false;
    }
  }
  return true;
}

function applySceneUpdateDelta(
  state: Map<string, SceneEntityRecord>,
  { timeNs, update }: EpisodeSceneUpdateDelta,
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
      updatedAtNs,
    });
  }
}

function compareSceneUpdateDeltas(
  left: EpisodeSceneUpdateDelta,
  right: EpisodeSceneUpdateDelta,
): number {
  if (left.timeNs === right.timeNs) {
    return 0;
  }
  return left.timeNs < right.timeNs ? -1 : 1;
}
