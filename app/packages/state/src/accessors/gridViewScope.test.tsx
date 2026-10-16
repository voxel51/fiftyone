import { act, cleanup, renderHook } from "@testing-library/react";
// Exercise the existing Recoil stores; production callers use the domain hook.
// eslint-disable-next-line no-restricted-imports
import { RecoilRoot, useSetRecoilState, type RecoilState } from "recoil";
import { afterEach, describe, expect, it, vi } from "vitest";

// Both extended-stage selectors as plain atoms, so the test can tell which
// one the grid scope reads
vi.mock("../recoil/selectors", async () => {
  const { atom } = await import("recoil");
  return {
    datasetId: atom({ key: "gridViewScopeTestDatasetId", default: "dataset" }),
    datasetName: atom({ key: "gridViewScopeTestDataset", default: "dataset" }),
    extendedStages: atom({ key: "gridViewScopeTestStages", default: {} }),
    gridExtendedStages: atom({
      key: "gridViewScopeTestGridStages",
      default: {},
    }),
  };
});
// The sort's field list reads the schema and config, which this test leaves out
vi.mock("../recoil/grid", async (importOriginal) => {
  const { atom } = await import("recoil");
  return {
    ...(await importOriginal<typeof import("../recoil/grid")>()),
    gridSortBy: atom({ key: "gridViewScopeTestSort", default: null }),
  };
});
import * as selectors from "../recoil/selectors";
import { useGridViewScope } from "./dataset";

// writable atoms here, by the mock above
const extendedStages =
  selectors.extendedStages as unknown as RecoilState<object>;
const gridExtendedStages =
  selectors.gridExtendedStages as unknown as RecoilState<object>;

const EXCLUDE = "fiftyone.core.stages.ExcludeFields";

afterEach(cleanup);

describe("the grid scope", () => {
  it("reads the grid's stages, so an Explore lens switch keeps it", () => {
    const gridStages = { [EXCLUDE]: { field_names: ["clip2"] } };
    const { result } = renderHook(
      () => ({
        scope: useGridViewScope(),
        setStages: useSetRecoilState(extendedStages),
      }),
      {
        wrapper: ({ children }) => (
          <RecoilRoot
            initializeState={({ set }) => {
              set(gridExtendedStages, gridStages);
              set(extendedStages, {
                [EXCLUDE]: { field_names: ["clip2", "gt"] },
              });
            }}
          >
            {children}
          </RecoilRoot>
        ),
      },
    );
    const before = result.current.scope;
    expect(before.extendedStages).toStrictEqual(gridStages);

    // the lens-aware stages change; the grid scope does not
    act(() =>
      result.current.setStages({
        [EXCLUDE]: { field_names: ["clip2", "predictions"] },
      }),
    );
    expect(result.current.scope).toStrictEqual(before);
  });
});
