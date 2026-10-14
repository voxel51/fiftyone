import { act, cleanup, renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { PropsWithChildren } from "react";
import {
  RecoilRoot,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import { afterEach, describe, expect, it, vi } from "vitest";

// Only the server-fed inputs are replaced. Domain identity and both stores,
// including the effect that mirrors the grid boundary, are the production code.
vi.mock("./selectors", async () => {
  const { atom } = await import("recoil");
  return {
    datasetId: atom({ key: "scopeTestDataset", default: "quickstart" }),
  };
});
vi.mock("./view", async () => {
  const { atom } = await import("recoil");
  return { view: atom<unknown[]>({ key: "scopeTestView", default: [] }) };
});
vi.mock("../accessors/dataset", async () => {
  const { useRecoilValue } = await import("recoil");
  const { datasetId } = await import("./selectors");
  const { view } = await import("./view");
  const { useSetSelectionBoundaries, useSetSelectionScopeBoundary } =
    await import("./selectionScope");
  const empty = {};
  return {
    useCurrentDatasetId: () => useRecoilValue(datasetId),
    useDatasetMediaType: () => "image",
    useSampleSchema: () => empty,
    useGridViewScope: () => ({ view: useRecoilValue(view), filters: empty }),
    useSetSelectionBoundaries,
    useSetSelectionScopeBoundary,
  };
});

import {
  useGridSelectionBoundary,
  useSyncSelectionScope,
} from "../selection/grid-hooks";
import {
  useInvalidateSelectionScope,
  useOpenSelectionBoundary,
} from "../selection/hooks";
import { selectionDomainId, viewConversion } from "../selection/model";
import type { SelectionBoundary } from "../selection/types";
import {
  selectionScopeBoundary,
  selectionScopeRevision,
} from "./selectionScope";
import { datasetId } from "./selectors";
import type { State } from "./types";
import { view } from "./view";

afterEach(cleanup);

const patches = (field: string): State.Stage[] => [
  { _cls: "fiftyone.core.stages.ToPatches", kwargs: [["field", field]] },
];

const domainOf = (stages: State.Stage[]) =>
  selectionDomainId("quickstart", viewConversion(stages)?.key ?? null);

function setup() {
  const store = createStore();
  const renders: {
    stages: State.Stage[];
    scope: SelectionBoundary | null;
  }[] = [];
  const wrapper = ({ children }: PropsWithChildren) => (
    <RecoilRoot>
      <Provider store={store}>{children}</Provider>
    </RecoilRoot>
  );
  const hook = renderHook(
    () => {
      useSyncSelectionScope();
      const [stages, setView] = useRecoilState(view);
      const setDataset = useSetRecoilState(datasetId);
      const [, setBoundary] = useGridSelectionBoundary();
      const scope = useRecoilValue(selectionScopeBoundary);
      const revision = useRecoilValue(selectionScopeRevision);
      const invalidate = useInvalidateSelectionScope("quickstart");
      const openBoundary = useOpenSelectionBoundary();
      renders.push({ stages, scope });
      return {
        setView,
        setDataset,
        setBoundary,
        openBoundary,
        scope,
        revision,
        invalidate,
      };
    },
    { wrapper },
  );
  return { ...hook, renders };
}

describe("view-scoped aggregation boundaries", () => {
  it("never pairs a samples view with a patches subset, in either direction", () => {
    const { result, renders } = setup();
    act(() => result.current.setBoundary({ subsetId: "animals" }));
    expect(result.current.scope).toEqual({ subsetId: "animals" });
    act(() => result.current.setView(patches("ground_truth")));
    act(() => result.current.setBoundary({ subsetId: "birds" }));
    expect(result.current.scope).toEqual({ subsetId: "birds" });

    // Observe every render, including the one before the grid republishes:
    // none may count unscoped, or within the other view's subset.
    renders.length = 0;
    for (let i = 0; i < 3; i++) {
      act(() => result.current.setView([]));
      expect(result.current.scope).toEqual({ subsetId: "animals" });
      act(() => result.current.setView(patches("ground_truth")));
      expect(result.current.scope).toEqual({ subsetId: "birds" });
    }
    for (const { stages, scope } of renders)
      expect(scope).toEqual({ subsetId: stages.length ? "birds" : "animals" });
  });

  it("counts within the subset a scope switch opens from its first render", () => {
    const { result, renders } = setup();
    act(() => result.current.setBoundary({ subsetId: "animals" }));
    renders.length = 0;
    // The scope picker opens a subset of another view kind: it sets that
    // domain's boundary, then switches the view, in one handler.
    act(() => {
      result.current.openBoundary(domainOf(patches("ground_truth")), {
        subsetId: "birds",
      });
      result.current.setView(patches("ground_truth"));
    });
    act(() => {
      result.current.openBoundary(domainOf([]), { subsetId: "dogs" });
      result.current.setView([]);
    });
    expect(result.current.scope).toEqual({ subsetId: "dogs" });
    for (const { stages, scope } of renders)
      expect(scope).toEqual({ subsetId: stages.length ? "birds" : "dogs" });
  });

  it("isolates different patch fields and datasets during the handoff", () => {
    const { result, renders } = setup();
    act(() => result.current.setView(patches("ground_truth")));
    act(() => result.current.setBoundary({ subsetId: "birds" }));
    renders.length = 0;
    act(() => result.current.setView(patches("predictions")));
    expect(renders.every(({ scope }) => !scope?.subsetId)).toBe(true);

    act(() => result.current.setBoundary({ subsetId: "predicted-birds" }));
    renders.length = 0;
    act(() => result.current.setDataset("other-dataset"));
    expect(renders.every(({ scope }) => !scope?.subsetId)).toBe(true);
  });

  it("keeps the scope across ordinary view stages and same-domain edits", () => {
    const { result } = setup();
    act(() => result.current.setBoundary({ subsetId: "animals" }));
    act(() =>
      result.current.setView([
        { _cls: "fiftyone.core.stages.Limit", kwargs: [["limit", 10]] },
      ]),
    );
    expect(result.current.scope).toEqual({ subsetId: "animals" });
    const boundary: SelectionBoundary = {
      subsetId: "segments",
      subsetScope: "segments",
      provider: { kind: "temporal-tags", values: ["moving"] },
    };
    act(() => result.current.setBoundary(boundary));
    expect(result.current.scope).toEqual(boundary);
    act(() => result.current.setBoundary({}));
    expect(result.current.scope).toEqual({});
  });

  it("publishes membership edits so counts are not read from cache", () => {
    const { result } = setup();
    act(() => result.current.setBoundary({ subsetId: "animals" }));
    const before = result.current.revision;
    act(() => result.current.invalidate());
    expect(result.current.revision).toBe(before + 1);

    act(() => result.current.setDataset("other-dataset"));
    expect(result.current.revision).toBe(0);
  });
});
