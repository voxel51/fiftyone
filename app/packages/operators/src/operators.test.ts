import { describe, expect, it, vi } from "vitest";
import { PluginScope } from "@fiftyone/plugins/src/PluginScope";
import { activeScopePayload, OperatorConfig } from "./operators";

// @fiftyone/spaces pulls in relay fragments, which cannot be compiled here
vi.mock("@fiftyone/spaces/src/SpaceNode", () => ({ default: class {} }));
vi.mock("@fiftyone/spaces/src/types", () => ({}));
vi.mock("@fiftyone/spaces/src/utils", () => ({ spaceNodeFromJSON: vi.fn() }));
vi.mock("@fiftyone/analytics", () => ({ usingAnalytics: vi.fn() }));

describe("OperatorConfig.fromJSON scopes", () => {
  it("reads a declared list of scopes", () => {
    const config = OperatorConfig.fromJSON({
      name: "op",
      scopes: ["dataset_samples_grid"],
    });
    expect(config.scopes).toEqual([PluginScope.DATASET_SAMPLES_GRID]);
  });

  it("uses the grid, modal, and landing fallback when the key is absent", () => {
    expect(OperatorConfig.fromJSON({ name: "op" }).scopes).toEqual([
      PluginScope.DATASET_SAMPLES_GRID,
      PluginScope.DATASET_SAMPLE_MODAL,
      PluginScope.FIFTYONE_LANDING_PAGE,
    ]);
  });

  it("maps a null scope declaration to all scopes", () => {
    const config = OperatorConfig.fromJSON({ name: "op", scopes: null });
    expect(config.scopes).toEqual([PluginScope.ALL]);
  });

  it("preserves an empty list, which restricts the operator to no scope", () => {
    const config = OperatorConfig.fromJSON({ name: "op", scopes: [] });
    expect(config.scopes).toEqual([]);
  });

  it("reads the scopes a panel was normalized to", () => {
    const config = OperatorConfig.fromJSON({
      name: "model_evaluation_panel_builtin",
      scopes: ["dataset_samples_grid"],
    });
    expect(config.scopes).toEqual([PluginScope.DATASET_SAMPLES_GRID]);
  });
});

describe("activeScopePayload", () => {
  it("uses activeScope for the request field", () => {
    expect(
      activeScopePayload({
        activeScope: PluginScope.FIFTYONE_LANDING_PAGE,
      } as never),
    ).toEqual({
      active_scope: PluginScope.FIFTYONE_LANDING_PAGE,
    });
  });
});
