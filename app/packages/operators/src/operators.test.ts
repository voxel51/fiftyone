import { describe, expect, it, vi } from "vitest";
import { OperatorSurface } from "./constants";
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
    expect(config.surfaces).toEqual([OperatorSurface.DATASET_SAMPLES_GRID]);
  });

  // undeclared is not the same as "grid and modal": it restricts nothing, so a
  // surface added later is picked up too
  it("leaves surfaces undeclared when the key is absent", () => {
    expect(OperatorConfig.fromJSON({ name: "op" }).surfaces).toBeUndefined();
  });

  // a portal panel is rendered anywhere a consumer places it
  it("leaves surfaces undeclared when null, as a portal panel sends", () => {
    const config = OperatorConfig.fromJSON({ name: "op", surfaces: null });
    expect(config.surfaces).toBeUndefined();
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
    expect(config.surfaces).toEqual([OperatorSurface.DATASET_SAMPLES_GRID]);
  });
});
