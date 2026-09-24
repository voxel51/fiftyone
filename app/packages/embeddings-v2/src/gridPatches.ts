/**
 * Which patches runs the grid's current view can link to.
 *
 * A patches run's points are the labels of ONE field, and a patches
 * view's documents are the labels of one field too (either of two, for
 * evaluation patches). When the fields differ the id spaces share
 * nothing: a lasso or filter in either one matches nothing in the
 * other, and the brain library rejects the pairing outright
 * (`_validate_patches_args`). Samples runs are unaffected — the server
 * maps sample ids into any patches view — so only patches runs are ever
 * unavailable.
 */
import type { VisualizationRun } from "./protocol";

const TO_PATCHES = "fiftyone.core.stages.ToPatches";
const TO_EVALUATION_PATCHES = "fiftyone.core.stages.ToEvaluationPatches";

export interface GridPatches {
  /** The label fields a patches run must embed to link to the grid */
  fields: readonly string[];
  /** What the grid shows, as hint copy: "ground_truth patches" */
  label: string;
}

interface StageLike {
  _cls: string;
  kwargs: readonly (readonly [string, unknown])[];
}

interface EvaluationLike {
  key: string;
  config: { gtField: string; predField: string };
}

/** Looked up by name: client-built stages carry fewer kwargs than the
 * server's (no `config`) */
function stringKwarg(stage: StageLike, name: string): string | null {
  const value = stage.kwargs.find(([key]) => key === name)?.[1];
  return typeof value === "string" ? value : null;
}

/**
 * The grid's patches view, or null when the grid is not one (samples,
 * clips, frames: every run links). Also null when the view's field cannot
 * be read, which fails open: a card wrongly enabled only costs the
 * warning the plot shows anyway, while a card wrongly disabled hides a
 * working run.
 */
export function gridPatches(
  stages: readonly StageLike[],
  isPatchesView: boolean,
  evaluations: readonly EvaluationLike[],
): GridPatches | null {
  if (!isPatchesView) return null;

  // The LAST patches stage shaped the view, and its class says which kind
  // of patches view it is
  for (let i = stages.length - 1; i >= 0; i--) {
    const stage = stages[i];

    if (stage._cls === TO_PATCHES) {
      const field = stringKwarg(stage, "field");
      return field ? { fields: [field], label: `${field} patches` } : null;
    }

    if (stage._cls === TO_EVALUATION_PATCHES) {
      const evalKey = stringKwarg(stage, "eval_key");
      const evaluation = evaluations.find((e) => e.key === evalKey);
      if (!evaluation) return null;
      const { gtField, predField } = evaluation.config;
      return {
        fields: [gtField, predField],
        label: `${gtField} / ${predField} patches`,
      };
    }
  }

  return null;
}

/** Why a run cannot link to the grid (the card's hint), or null when it can */
export function unavailableReason(
  run: Pick<VisualizationRun, "patchesField">,
  grid: GridPatches | null,
): string | null {
  if (!grid || !run.patchesField || grid.fields.includes(run.patchesField)) {
    return null;
  }
  return `Grid shows ${grid.label}`;
}

export interface ListedRun {
  run: VisualizationRun;
  unavailable: string | null;
}

/** The runs in list order: linkable ones first and unavailable ones last,
 * each group keeping the dataset's order */
export function listRuns(
  runs: readonly VisualizationRun[],
  grid: GridPatches | null,
): ListedRun[] {
  const listed = runs.map((run) => ({
    run,
    unavailable: unavailableReason(run, grid),
  }));
  return [
    ...listed.filter((item) => !item.unavailable),
    ...listed.filter((item) => item.unavailable),
  ];
}
