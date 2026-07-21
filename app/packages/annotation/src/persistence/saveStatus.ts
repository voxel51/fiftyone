import { atom, useAtomValue, useSetAtom } from "jotai";
import type { AnnotationRetryController } from "./usePersistenceRetryController";

/**
 * Health of annotation autosave, mirrored from the persistence retry
 * controller's tri-state. Drives the {@link SaveStatusIndicator} colour.
 */
export enum SaveHealth {
  /** Saves are succeeding. */
  Healthy = "healthy",
  /** Saves are failing but retries are still in progress. */
  Unhealthy = "unhealthy",
  /** Retries are exhausted; the user must reload to recover. */
  Stopped = "stopped",
}

/**
 * Collapses the retry controller's two booleans onto {@link SaveHealth}.
 * `canAttempt` false means retries are given up (stopped); `isUnhealthy`
 * true means the fallback window is active (unhealthy); otherwise healthy.
 */
export const deriveSaveHealth = (
  controller: Pick<AnnotationRetryController, "canAttempt" | "isUnhealthy">,
): SaveHealth => {
  if (!controller.canAttempt) {
    return SaveHealth.Stopped;
  }

  if (controller.isUnhealthy) {
    return SaveHealth.Unhealthy;
  }

  return SaveHealth.Healthy;
};

export interface SaveStatus {
  /** Current autosave health. */
  health: SaveHealth;
  /** True while a persistence request is in flight. */
  inFlight: boolean;
  /** Epoch ms of the last successful save, or null if none yet this session. */
  lastSavedAt: number | null;
}

// Module-level atom so the single publisher (the annotation composition root,
// which owns the retry controller and persistence event stream) and the
// indicator's reader resolve to the same default jotai store — mirrors the
// videoAnnotationStatus pattern.
const saveStatusAtom = atom<SaveStatus>({
  health: SaveHealth.Healthy,
  inFlight: false,
  lastSavedAt: null,
});

/**
 * Write access to the shared save status. Called once from the composition
 * root; accepts a `SaveStatus` or an updater so health and in-flight can be
 * set independently.
 */
export const usePublishSaveStatus = () => useSetAtom(saveStatusAtom);

/** Reads the current save status. Consumed by the save-status indicator. */
export const useSaveStatus = (): SaveStatus => useAtomValue(saveStatusAtom);
