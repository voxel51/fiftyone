/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The bar's working state: the stages being composed, before they are applied.
 */

import type { InputKind } from "./params";

/** In-progress stage being composed in the bar (not yet applied). */
export interface WorkingStage {
  /** Stable id for React keys + reducer addressing. */
  id: string;
  /** Stage class name, e.g. `"Match"`, `"SortBy"`. */
  cls: string;
  /** Mutable kwargs keyed by param name; values are whatever the
   *  user has typed/picked so far, not yet serialized. */
  kwargs: Record<string, unknown>;
  /**
   * The lowered MongoDB the server sent for expression params, keyed by param
   * name. The working value is the syntax; this is what the json editor shows
   * for it — the App cannot lower an expression itself, only remember the
   * lowering it was given.
   */
  lowered: Record<string, unknown>;
}

export interface BarState {
  stages: WorkingStage[];
}

export type BarAction =
  | { type: "hydrate"; stages: WorkingStage[] }
  /** Insert a new stage at a position in the bar. `index` may be
   *  0 (head), `stages.length` (tail), or any in-between slot.
   *  Caller pre-mints `id` so it can subsequently address the new
   *  stage (e.g., to auto-open its editing popover). */
  | {
      type: "insertStage";
      index: number;
      cls: string;
      id: string;
      kwargs: Record<string, unknown>;
    }
  | { type: "removeStage"; id: string }
  | { type: "setKwarg"; id: string; name: string; value: unknown }
  /** Reorder existing stages to match the given id ordering.
   *  Used by the RichList drag-reorder callback. */
  | { type: "reorderStages"; ids: string[] };
export const initialState: BarState = { stages: [] };

export const NO_ERRORS: ReadonlyMap<string, string> = new Map();

export const NO_KINDS: ReadonlyMap<string, InputKind> = new Map();

export const makeId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const reducer = (state: BarState, action: BarAction): BarState => {
  switch (action.type) {
    case "hydrate":
      return { stages: action.stages };
    case "insertStage": {
      const stages = [...state.stages];
      const insertAt = Math.max(0, Math.min(action.index, stages.length));
      stages.splice(insertAt, 0, {
        id: action.id,
        cls: action.cls,
        kwargs: action.kwargs,
        lowered: {},
      });
      return { stages };
    }
    case "removeStage":
      return { stages: state.stages.filter((s) => s.id !== action.id) };
    case "setKwarg":
      return {
        stages: state.stages.map((s) =>
          s.id === action.id
            ? { ...s, kwargs: { ...s.kwargs, [action.name]: action.value } }
            : s,
        ),
      };
    case "reorderStages": {
      const byId = new Map(state.stages.map((s) => [s.id, s]));
      const reordered = action.ids
        .map((id) => byId.get(id))
        .filter((s): s is WorkingStage => s !== undefined);
      return { stages: reordered };
    }
    default:
      return state;
  }
};

/**
 * Working stages built from a serialized view — how the bar reads what the
 * server holds.
 *
 * A stage serializes its expressions twice: as the lowered MongoDB its
 * pipeline runs, and — beside `kwargs`, not inside it — as the syntax they
 * were written in. The lowering is one-way, so the envelope is the only thing
 * that can reopen as `F(...)`; it is overlaid exactly as
 * `ViewStage._from_dict` does on the way back in, while the lowering it
 * displaces is kept for the json editor to show.
 */
export const workingStagesFromView = (
  view: readonly SerializedStage[],
): WorkingStage[] =>
  view.map((s, i) => ({
    id: `view-${i}-${s._cls}`,
    cls: s._cls.slice(s._cls.lastIndexOf(".") + 1),
    kwargs: {
      ...Object.fromEntries(s.kwargs ?? []),
      ...(s._expr_asts ?? {}),
    },
    lowered: Object.fromEntries(
      (s.kwargs ?? []).filter(([name]) => name in (s._expr_asts ?? {})),
    ),
  }));

/**
 * JSON with keys sorted at every level, so two values that mean the same
 * thing compare equal however they were built — an envelope assembled by the
 * App's parser and the same envelope serialized by Python differ only in key
 * order.
 */
const stable = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stable).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
};

export interface SerializedStage {
  _cls: string;
  kwargs?: [string, unknown][];
  _expr_asts?: Record<string, unknown>;
}

/**
 * A view reduced to what it means, for deciding whether two views are the
 * same one.
 *
 * `_uuid` is server bookkeeping. `_expr_asts` is the syntax of an expression
 * whose lowering sits in `kwargs`, so it is overlaid exactly as hydration
 * overlays it — a view echoed back after Apply then compares equal to the
 * working state that produced it. Empty values are dropped from both sides,
 * because serialization omits kwargs the user never filled while the server
 * echoes them as nulls.
 */
export const viewFingerprint = (stages: readonly SerializedStage[]): string =>
  stable(
    stages.map((stage) => {
      const asts = stage._expr_asts ?? {};
      const kwargs = (stage.kwargs ?? []).filter(
        ([, value]) =>
          value !== null &&
          value !== undefined &&
          value !== "" &&
          !(Array.isArray(value) && value.length === 0),
      );

      return {
        cls: stage._cls,
        kwargs: kwargs.map(([name, value]) => [name, asts[name] ?? value]),
      };
    }),
  );
