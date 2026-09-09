/** Placement state relevant to retaining the last valid 3D scene. */
export type Scene3dSnapshotReadiness =
  | "ready"
  | "pending"
  | "definitiveMissing";

/** A scene snapshot retained across asynchronous placement transitions. */
export interface HeldScene3dSnapshot<Snapshot> {
  readonly definitiveMissingSinceMs: number | null;
  readonly key: string;
  readonly retainable: boolean;
  readonly snapshot: Snapshot;
}

/** Why the selector is displaying a previously committed scene. */
export type Scene3dHeldSceneReason = "pending" | "definitiveMissing";

/** Result of selecting the current or retained 3D scene. */
export interface Scene3dSnapshotSelection<Snapshot> {
  readonly graceRemainingMs: number | null;
  readonly heldReason: Scene3dHeldSceneReason | null;
  readonly nextHeld: HeldScene3dSnapshot<Snapshot> | null;
  readonly snapshot: Snapshot;
}

/**
 * Selects a stable 3D scene without hiding persistent placement failures.
 * Pending placement retains the last scene for the same semantic source.
 * Definitively missing placement gets only a bounded grace period, and only
 * while source data still exists; otherwise the current scene commits.
 */
export function selectScene3dSnapshot<Snapshot>({
  current,
  currentRetainable,
  definitiveMissingGraceMs,
  empty,
  hasSourceData,
  held,
  key,
  nowMs,
  readiness,
}: {
  readonly current: Snapshot;
  readonly currentRetainable: boolean;
  readonly definitiveMissingGraceMs: number;
  readonly empty: Snapshot;
  readonly hasSourceData: boolean;
  readonly held: HeldScene3dSnapshot<Snapshot> | null;
  readonly key: string;
  readonly nowMs: number;
  readonly readiness: Scene3dSnapshotReadiness;
}): Scene3dSnapshotSelection<Snapshot> {
  if (readiness === "ready") {
    return committedSelection(current, currentRetainable, key);
  }

  const matchingHeld = held?.key === key ? held : null;
  if (readiness === "pending") {
    if (matchingHeld?.retainable) {
      const nextHeld = {
        ...matchingHeld,
        definitiveMissingSinceMs: null,
      };
      return {
        graceRemainingMs: null,
        heldReason: "pending",
        nextHeld,
        snapshot: matchingHeld.snapshot,
      };
    }
    return {
      graceRemainingMs: null,
      heldReason: null,
      nextHeld: null,
      snapshot: empty,
    };
  }

  const graceMs = Math.max(0, definitiveMissingGraceMs);
  if (hasSourceData && matchingHeld?.retainable && graceMs > 0) {
    const missingSinceMs =
      matchingHeld.definitiveMissingSinceMs ?? Math.max(0, nowMs);
    const elapsedMs = Math.max(0, nowMs - missingSinceMs);
    const graceRemainingMs = graceMs - elapsedMs;
    if (graceRemainingMs > 0) {
      const nextHeld = {
        ...matchingHeld,
        definitiveMissingSinceMs: missingSinceMs,
      };
      return {
        graceRemainingMs,
        heldReason: "definitiveMissing",
        nextHeld,
        snapshot: matchingHeld.snapshot,
      };
    }
  }

  return committedSelection(current, currentRetainable, key);
}

function committedSelection<Snapshot>(
  snapshot: Snapshot,
  retainable: boolean,
  key: string,
): Scene3dSnapshotSelection<Snapshot> {
  return {
    graceRemainingMs: null,
    heldReason: null,
    nextHeld: {
      definitiveMissingSinceMs: null,
      key,
      retainable,
      snapshot,
    },
    snapshot,
  };
}
