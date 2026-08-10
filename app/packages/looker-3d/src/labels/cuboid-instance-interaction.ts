/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * instanceId -> label resolution for `CuboidInstances`' batched `InstancedMesh`.
 * `instanceId` is r3f's raycast result index into whatever array backed the
 * mesh at hit-test time; `undefined` means "no instance under the pointer".
 */
export function resolveLabelByInstanceId<T>(
  labelsByIndex: readonly T[],
  instanceId: number | undefined,
): T | null {
  return instanceId === undefined ? null : (labelsByIndex[instanceId] ?? null);
}

/**
 * r3f doesn't guarantee `instanceId` on an `InstancedMesh`'s pointer-out
 * event (the pointer has already left the instance the raycast last hit), so
 * `CuboidInstances` tracks which instance is currently hovered itself and
 * resolves the outgoing label from that on pointer-out instead of from the
 * (possibly absent) event.
 *
 * Kept as a plain object rather than a React ref/hook: the only requirement
 * is "remember the last set index until it's consumed once," which needs no
 * React lifecycle of its own — the component owns one instance in a ref.
 */
export function createHoverIndexTracker() {
  let hoveredIndex: number | null = null;
  return {
    /** Record the instance currently under the pointer (or `null` to clear). */
    setHovered(index: number | null): void {
      hoveredIndex = index;
    },
    /** Read-and-clear: returns the last hovered index, then forgets it. */
    consumeHovered(): number | null {
      const index = hoveredIndex;
      hoveredIndex = null;
      return index;
    },
  };
}
