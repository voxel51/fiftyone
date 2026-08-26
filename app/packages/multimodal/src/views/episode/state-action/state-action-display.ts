import { atom } from "jotai";
import type { StateActionFeatureStats } from "../../../ports";

/**
 * How the State & Action tile displays numeric values. "raw" shows source
 * values; "zscore" and "quantile" show what a normalization-trained policy
 * sees, using the dataset-declared statistics. Copy always yields the raw
 * exact value — normalized floats are derived, not reconciliation-grade.
 */
export type StateActionValueMode = "raw" | "zscore" | "quantile";

/** Shared across State & Action tiles: one inspection mode per modal. */
export const stateActionValueModeAtom = atom<StateActionValueMode>("raw");

export const STATE_ACTION_VALUE_MODES: readonly {
  readonly label: string;
  readonly value: StateActionValueMode;
}[] = [
  { label: "Raw", value: "raw" },
  { label: "Z-score", value: "zscore" },
  { label: "Quantile [−1, 1]", value: "quantile" },
];

/**
 * Which statistics the Statistics tab shows: the dataset-declared numbers,
 * this episode's computed numbers, or both layered together.
 */
export type StateActionStatsScope = "both" | "dataset" | "episode";

export const STATE_ACTION_STATS_SCOPES: readonly {
  readonly label: string;
  readonly value: StateActionStatsScope;
}[] = [
  { label: "Dataset", value: "dataset" },
  { label: "Episode", value: "episode" },
  { label: "Dataset + Episode", value: "both" },
];

const STATS_SCOPE_STORAGE_KEY = "fiftyone-multimodal-state-action-stats-scope";

/** Returns the persisted scope, defaulting to "both" on anything else. */
export function readStoredStatsScope(): StateActionStatsScope {
  try {
    const raw = globalThis.localStorage?.getItem(STATS_SCOPE_STORAGE_KEY);
    return raw === "dataset" || raw === "episode" || raw === "both"
      ? raw
      : "both";
  } catch {
    return "both";
  }
}

const baseStatsScopeAtom = atom<StateActionStatsScope>(readStoredStatsScope());

/** Statistics-tab scope, persisted browser-wide across sessions. */
export const stateActionStatsScopeAtom = atom(
  (get) => get(baseStatsScopeAtom),
  (_get, set, next: StateActionStatsScope) => {
    set(baseStatsScopeAtom, next);
    try {
      globalThis.localStorage?.setItem(STATS_SCOPE_STORAGE_KEY, next);
    } catch {
      // Private windows without storage still honor the in-session choice.
    }
  },
);

/** Value-column header per display mode. */
export function stateActionValueHeader(mode: StateActionValueMode): string {
  if (mode === "zscore") return "Z-score";
  if (mode === "quantile") return "Q-scaled";
  return "Value";
}

/**
 * Normalizes one value with the dataset-declared statistics, or null when
 * the mode is raw or this dimension lacks usable declared parameters — the
 * caller then falls back to the raw value rather than inventing a scale.
 */
export function normalizeStateActionValue(
  mode: StateActionValueMode,
  stats: StateActionFeatureStats | undefined,
  index: number,
  value: number,
): number | null {
  if (mode === "zscore") {
    const mean = stats?.mean?.[index];
    const std = stats?.std?.[index];
    if (
      mean === undefined ||
      std === undefined ||
      !Number.isFinite(mean) ||
      !Number.isFinite(std) ||
      std <= 0
    ) {
      return null;
    }
    return (value - mean) / std;
  }
  if (mode === "quantile") {
    const q01 = stats?.q01?.[index];
    const q99 = stats?.q99?.[index];
    if (
      q01 === undefined ||
      q99 === undefined ||
      !Number.isFinite(q01) ||
      !Number.isFinite(q99) ||
      q99 <= q01
    ) {
      return null;
    }
    return ((value - q01) / (q99 - q01)) * 2 - 1;
  }
  return null;
}

/**
 * Compact signed delta. Three significant digits on purpose: a delta is a
 * change indicator, not a reconciliation value (the exact delta rides the
 * cell's hover title), and the tight bound keeps the Δ column at a fixed
 * width so value and delta columns align across every row.
 */
export function formatStateActionDelta(delta: number): string {
  if (delta === 0) return "0";
  const magnitude = Math.abs(delta);
  const compact =
    magnitude >= 1e5 || magnitude < 1e-3
      ? delta.toExponential(1)
      : String(Number(delta.toPrecision(3)));
  return delta > 0 ? `+${compact}` : compact;
}
