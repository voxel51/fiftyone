import { act, cleanup, renderHook } from "@testing-library/react";
// Exercise the existing Recoil stores; production callers use the hooks.
// eslint-disable-next-line no-restricted-imports
import {
  RecoilRoot,
  useRecoilValue,
  useSetRecoilState,
  type RecoilState,
} from "recoil";
import { afterEach, describe, expect, it, vi } from "vitest";

// The stage inputs as plain atoms: the task's exclusions, and the task's
// plus the Explore lens's
vi.mock("./schemaSettings.atoms", async () => {
  const { atom } = await import("recoil");
  return {
    taskSchemaStageExclusions: atom<string[] | null>({
      key: "gridStagesTestTask",
      default: ["clip2"],
    }),
    activeSchemaStageExclusions: atom<string[] | null>({
      key: "gridStagesTestActive",
      default: ["clip2", "gt"],
    }),
  };
});
// Field Visibility and the grid sort
vi.mock("@fiftyone/state", async () => {
  const { atom } = await import("recoil");
  return {
    fieldVisibilityStage: atom({
      key: "gridStagesTestFieldVisibility",
      default: null,
    }),
    gridSortBy: atom({
      key: "gridStagesTestSort",
      default: { field: "confidence", descending: true },
    }),
  };
});
import { activeSchemaStageExclusions } from "./schemaSettings.atoms";
import { extendedStages, gridExtendedStages } from "./selectors";

// a writable atom here, by the mock above
const lensAndTask = <RecoilState<string[] | null>>(
  (<unknown>activeSchemaStageExclusions)
);

const EXCLUDE = "fiftyone.core.stages.ExcludeFields";

afterEach(cleanup);

describe("grid extended stages", () => {
  it("leave out the Explore lens, so a lens switch keeps the grid's request", () => {
    const { result } = renderHook(
      () => ({
        grid: useRecoilValue(gridExtendedStages),
        aggregations: useRecoilValue(extendedStages),
        setActive: useSetRecoilState(lensAndTask),
      }),
      { wrapper: RecoilRoot },
    );

    const before = result.current.grid;
    expect(before[EXCLUDE].field_names).toStrictEqual(["clip2"]);
    expect(result.current.aggregations[EXCLUDE].field_names).toStrictEqual([
      "clip2",
      "gt",
    ]);
    // the sort still rides the grid's stages
    expect(before["fiftyone.core.stages.SortBy"]).toStrictEqual({
      field_or_expr: "confidence",
      reverse: true,
      create_index: false,
    });

    // a lens switch changes the aggregation stages only
    act(() => result.current.setActive(["clip2", "predictions"]));

    expect(result.current.grid).toStrictEqual(before);
    expect(result.current.aggregations[EXCLUDE].field_names).toStrictEqual([
      "clip2",
      "predictions",
    ]);
  });
});
