// Deep imports on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest.
import { usePlaybackStore } from "@fiftyone/playback/runtime";
import type { PlaybackStore } from "@fiftyone/playback/runtime";
import { atom, useAtomValue, type PrimitiveAtom } from "jotai";

/**
 * Live gated-start progress for the active play press: how much runway the
 * bandwidth-aware startup gate is waiting for and the estimated wall wait
 * left. Published only while a play press is pending behind the gate;
 * `null` otherwise. Modal chrome renders it so the wait reads as honest
 * buffering, not a hang.
 */
export interface StartupCushionState {
  /**
   * Estimated wall seconds until the gate clears, shrinking with coverage.
   */
  readonly estimatedWaitSeconds: number;

  /**
   * Fraction of the required runway already covered, 0..1 — the honest
   * fill level for gauge-style progress chrome.
   */
  readonly progressFraction: number;

  /**
   * Content seconds of runway the gate requires for this start.
   */
  readonly targetSeconds: number;
}

const startupCushionAtom = atom<StartupCushionState | null>(
  null,
) as PrimitiveAtom<StartupCushionState | null>;

export function useStartupCushionState(): StartupCushionState | null {
  const store = usePlaybackStore();
  return useAtomValue(startupCushionAtom, { store });
}

export function getStartupCushionState(
  store: PlaybackStore,
): StartupCushionState | null {
  return store.get(startupCushionAtom);
}

export function setStartupCushionState(
  store: PlaybackStore,
  state: StartupCushionState | null,
): void {
  const previous = store.get(startupCushionAtom);
  if (previous === state) {
    return;
  }
  // Display granularity (whole seconds, 2% fill steps): skip writes that
  // can't change what the chip renders (statuses republish at
  // RAF-adjacent rates during exactly the window this atom is populated).
  if (
    previous !== null &&
    state !== null &&
    previous.targetSeconds === state.targetSeconds &&
    Math.round(previous.estimatedWaitSeconds) ===
      Math.round(state.estimatedWaitSeconds) &&
    Math.round(previous.progressFraction * 50) ===
      Math.round(state.progressFraction * 50)
  ) {
    return;
  }
  store.set(startupCushionAtom, state);
}

export function resetStartupCushionState(store: PlaybackStore): void {
  store.set(startupCushionAtom, null);
}
