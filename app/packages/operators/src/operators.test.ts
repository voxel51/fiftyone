import { describe, expect, it, vi } from "vitest";
import { OperatorScope } from "./constants";
import { OperatorConfig } from "./operators";

// @fiftyone/spaces pulls in relay fragments, which cannot be compiled here
vi.mock("@fiftyone/spaces/src/SpaceNode", () => ({ default: class {} }));
vi.mock("@fiftyone/spaces/src/types", () => ({}));
vi.mock("@fiftyone/spaces/src/utils", () => ({ spaceNodeFromJSON: vi.fn() }));
vi.mock("@fiftyone/analytics", () => ({ usingAnalytics: vi.fn() }));

describe("OperatorConfig.fromJSON surfaces", () => {
  it("reads a declared list of surfaces", () => {
    const config = OperatorConfig.fromJSON({
      name: "op",
      surfaces: ["dataset_samples_grid"],
    });
    expect(config.surfaces).toEqual([OperatorScope.DATASET_SAMPLES_GRID]);
  });

  it("uses the legacy grid, modal, and landing fallback when the key is absent", () => {
    expect(OperatorConfig.fromJSON({ name: "op" }).surfaces).toEqual([
      OperatorScope.DATASET_SAMPLES_GRID,
      OperatorScope.DATASET_SAMPLE_MODAL,
      OperatorScope.FIFTYONE_LANDING_PAGE,
    ]);
  });

  it("accepts the legacy null portal encoding", () => {
    const config = OperatorConfig.fromJSON({ name: "op", surfaces: null });
    expect(config.surfaces).toEqual([OperatorScope.ALL]);
  });

  it("preserves an empty list, which restricts the operator to no surface", () => {
    const config = OperatorConfig.fromJSON({ name: "op", surfaces: [] });
    expect(config.surfaces).toEqual([]);
  });

  // PanelConfig normalizes its "grid" | "modal" | "grid modal" string to
  // operator surfaces before serializing, so a panel arrives here already
  // speaking this vocabulary
  it("reads the surfaces a panel was normalized to", () => {
    const config = OperatorConfig.fromJSON({
      name: "model_evaluation_panel_builtin",
      surfaces: ["dataset_samples_grid"],
    });
    expect(config.surfaces).toEqual([OperatorScope.DATASET_SAMPLES_GRID]);
  });
});
