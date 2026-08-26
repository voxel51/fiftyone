import { atom } from "jotai";
import type { StateActionFeatureStats } from "../../../ports";
import { compactStateActionFloat } from "./state-action-format";

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

/** Compact signed delta, or null for a change too small to print. */
export function formatStateActionDelta(delta: number): string {
  if (delta === 0) return "0";
  const compact = compactStateActionFloat(delta);
  return delta > 0 ? `+${compact}` : compact;
}
