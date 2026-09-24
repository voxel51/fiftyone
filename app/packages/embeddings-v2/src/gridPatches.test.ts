import { describe, expect, it } from "vitest";
import {
  gridPatches,
  listRuns,
  plotWarning,
  unavailableReason,
} from "./gridPatches";
import type { VisualizationRun } from "./protocol";

const stage = (_cls: string, kwargs: [string, unknown][]) => ({
  _cls,
  kwargs,
});

// Client-built, as useToPatches pushes it: fewer kwargs than the server's
const toPatches = (field: string) =>
  stage("fiftyone.core.stages.ToPatches", [
    ["field", field],
    ["_state", null],
  ]);

const toEvaluationPatches = (evalKey: string) =>
  stage("fiftyone.core.stages.ToEvaluationPatches", [
    ["eval_key", evalKey],
    ["_state", null],
  ]);

const evaluation = {
  key: "eval",
  config: { gtField: "ground_truth", predField: "predictions" },
};

const run = (
  brainKey: string,
  patchesField: string | null,
): VisualizationRun => ({
  brainKey,
  method: "umap",
  dims: 2,
  patchesField,
  pointsField: null,
  model: null,
  ready: true,
  error: null,
  timestamp: null,
});

describe("gridPatches", () => {
  it("is null outside patches views", () => {
    expect(gridPatches([], false, [])).toBeNull();
    // The view class decides, not a stage's presence
    expect(gridPatches([toPatches("ground_truth")], false, [])).toBeNull();
  });

  it("reads a patches view's field off its ToPatches stage", () => {
    expect(
      gridPatches(
        [
          stage("fiftyone.core.stages.Limit", [["limit", 5]]),
          toPatches("ground_truth"),
          stage("fiftyone.core.stages.Limit", [["limit", 3]]),
        ],
        true,
        [],
      ),
    ).toEqual({ fields: ["ground_truth"], label: "ground_truth patches" });
  });

  // The brain library accepts either field of the evaluation for an
  // evaluation patches view, so both link
  it("accepts both fields of an evaluation patches view", () => {
    expect(
      gridPatches([toEvaluationPatches("eval")], true, [evaluation]),
    ).toEqual({
      fields: ["ground_truth", "predictions"],
      label: "ground_truth / predictions patches",
    });
  });

  // An unreadable view must not disable working runs
  it("fails open when the view's field cannot be read", () => {
    expect(gridPatches([], true, [])).toBeNull();
    expect(
      gridPatches([toEvaluationPatches("gone")], true, [evaluation]),
    ).toBeNull();
  });
});

describe("unavailableReason", () => {
  const grid = { fields: ["ground_truth"], label: "ground_truth patches" };

  it("never blocks a samples run", () => {
    expect(unavailableReason(run("viz", null), grid)).toBeNull();
  });

  it("blocks only patches runs on another field", () => {
    expect(unavailableReason(run("gt", "ground_truth"), grid)).toBeNull();
    expect(unavailableReason(run("fake", "fake"), grid)).toBe(
      "The grid shows ground_truth patches. This run embeds fake patches.",
    );
  });

  it("blocks nothing outside a patches view", () => {
    expect(unavailableReason(run("fake", "fake"), null)).toBeNull();
  });
});

describe("plotWarning", () => {
  const grid = { fields: ["ground_truth"], label: "ground_truth patches" };

  // The grid changed after the run opened: the plot says what no longer
  // reaches the grid
  it("warns only when the open run cannot link to the grid", () => {
    expect(plotWarning(run("fake", "fake"), grid)).toBe(
      "The grid shows ground_truth patches, but this run embeds fake patches. Lasso and filters don't apply to the grid.",
    );
    expect(plotWarning(run("gt", "ground_truth"), grid)).toBeNull();
    expect(plotWarning(run("viz", null), grid)).toBeNull();
    expect(plotWarning(run("fake", "fake"), null)).toBeNull();
  });
});

describe("listRuns", () => {
  it("sinks unavailable runs to the bottom, each group in dataset order", () => {
    const grid = { fields: ["ground_truth"], label: "ground_truth patches" };
    const listed = listRuns(
      [
        run("fake_a", "fake"),
        run("viz", null),
        run("fake_b", "fake"),
        run("gt", "ground_truth"),
      ],
      grid,
    );

    expect(listed.map(({ run }) => run.brainKey)).toEqual([
      "viz",
      "gt",
      "fake_a",
      "fake_b",
    ]);
    expect(listed.map(({ unavailable }) => Boolean(unavailable))).toEqual([
      false,
      false,
      true,
      true,
    ]);
  });
});
