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
