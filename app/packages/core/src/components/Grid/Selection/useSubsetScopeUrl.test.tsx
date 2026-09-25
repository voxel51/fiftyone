import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SavedSubset,
  SelectionBoundary,
} from "@fiftyone/state/src/selection";

const mocks = vi.hoisted(() => ({
  datasetId: "dataset-a",
  domainId: "dataset-a",
  enabled: true,
  getSubset: vi.fn(),
  openSubset: vi.fn(),
}));
let boundary: SelectionBoundary;
let setBoundary: (value: SelectionBoundary) => void;

vi.mock("@fiftyone/state/src/selection", async () => ({
  ...(await import("@fiftyone/state/src/selection/model")),
  getSubset: mocks.getSubset,
  useGridSelectionDataset: () => mocks,
  useSelectionBoundary: () => {
    [boundary, setBoundary] = useState<SelectionBoundary>({});
    return [boundary, setBoundary];
  },
}));
vi.mock("./useSubsetScope", () => ({
  useOpenSubset: () => mocks.openSubset,
}));

import { useSubsetScopeUrl } from "./useSubsetScopeUrl";

const preference = (id = "dataset-a") => `fiftyone:grid-scope:${id}`;
const navigate = (query: string, path = "/datasets/a") => {
  window.history.replaceState(window.history.state, "", `${path}${query}`);
};

beforeEach(() => {
  localStorage.clear();
  navigate("");
  mocks.datasetId = mocks.domainId = "dataset-a";
  mocks.enabled = true;
  mocks.getSubset.mockReset().mockResolvedValue({ id: "one", view: null });
  mocks.openSubset.mockReset().mockImplementation((subsetId, subsetScope) => {
    setBoundary({ subsetId, subsetScope });
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("saved subset scope URL and preferences", () => {
  it("restores local scope on a fresh mount and adds it to the URL", async () => {
    localStorage.setItem(
      preference(),
      JSON.stringify({ subsetId: "one", subsetScope: "segments" }),
    );
    renderHook(useSubsetScopeUrl);
    await waitFor(() => expect(boundary.subsetId).toBe("one"));
    expect(boundary.subsetScope).toBe("segments");
    expect(window.location.search).toBe("?subset=one&subsetScope=segments");
    expect(mocks.openSubset).not.toHaveBeenCalled();
  });

  it("lets an explicit URL win over storage, including an explicit all-samples link", async () => {
    localStorage.setItem(preference(), JSON.stringify({ subsetId: "old" }));
    navigate("?subset=linked");
    const hook = renderHook(useSubsetScopeUrl);
    await waitFor(() => expect(boundary.subsetId).toBe("linked"));
    expect(JSON.parse(localStorage.getItem(preference())!).subsetId).toBe(
      "linked",
    );
    hook.unmount();
    navigate("?subset=");
    renderHook(useSubsetScopeUrl);
    expect(boundary.subsetId).toBeUndefined();
    expect(localStorage.getItem(preference())).toBeNull();
  });

  it("writes scope commands and clears both URL and preference for All samples", () => {
    navigate("?id=sample&schemaManager=open#anchor");
    window.history.replaceState({ marker: "keep" }, "");
    renderHook(useSubsetScopeUrl);
    act(() =>
      setBoundary({
        subsetId: "two",
        subsetScope: "segments",
        provider: { kind: "temporal-tags", values: ["hidden"] },
      }),
    );
    expect(window.location.search).toBe(
      "?id=sample&schemaManager=open&subset=two&subsetScope=segments",
    );
    expect(window.location.hash).toBe("#anchor");
    expect(window.history.state).toEqual({ marker: "keep" });
    expect(JSON.parse(localStorage.getItem(preference())!)).toEqual({
      subsetId: "two",
      subsetScope: "segments",
    });
    act(() => setBoundary({}));
    expect(window.location.search).toBe("?id=sample&schemaManager=open");
    expect(localStorage.getItem(preference())).toBeNull();
  });

  it("reacts to URL changes and removal without restoring the old preference", async () => {
    renderHook(useSubsetScopeUrl);
    act(() => navigate("?subset=one"));
    await waitFor(() => expect(boundary.subsetId).toBe("one"));
    act(() => navigate("?subset=two&subsetScope=segments"));
    await waitFor(() => expect(boundary.subsetId).toBe("two"));
    act(() => navigate(""));
    expect(boundary.subsetId).toBeUndefined();
    expect(localStorage.getItem(preference())).toBeNull();
  });

  it("restores scopes on browser back and forward", async () => {
    navigate("?subset=one");
    renderHook(useSubsetScopeUrl);
    await waitFor(() => expect(boundary.subsetId).toBe("one"));
    act(() => window.history.pushState({}, "", "?subset=two"));
    await waitFor(() => expect(boundary.subsetId).toBe("two"));
    act(() => window.history.back());
    await waitFor(() => expect(boundary.subsetId).toBe("one"));
    act(() => window.history.forward());
    await waitFor(() => expect(boundary.subsetId).toBe("two"));
  });

  it("does not reopen or clear captures when only the modal URL changes", () => {
    renderHook(useSubsetScopeUrl);
    act(() => setBoundary({ subsetId: "one" }));
    act(() => navigate("?subset=one&id=sample"));
    expect(mocks.openSubset).not.toHaveBeenCalled();
    expect(boundary.subsetId).toBe("one");
  });

  it("isolates preferences across datasets and ignores an outgoing dataset during navigation", async () => {
    localStorage.setItem(
      preference("dataset-b"),
      JSON.stringify({ subsetId: "in-b" }),
    );
    const { rerender } = renderHook(useSubsetScopeUrl);
    act(() => setBoundary({ subsetId: "in-a" }));
    act(() => navigate("", "/datasets/b"));
    expect(boundary.subsetId).toBe("in-a");
    act(() => {
      mocks.datasetId = mocks.domainId = "dataset-b";
      rerender();
    });
    await waitFor(() => expect(boundary.subsetId).toBe("in-b"));
    expect(JSON.parse(localStorage.getItem(preference())!).subsetId).toBe(
      "in-a",
    );
    expect(mocks.getSubset).toHaveBeenCalledWith("dataset-b", "in-b");
  });

  it("reopens a patch subset with its saved conversion", async () => {
    const view = [
      {
        _cls: "fiftyone.core.stages.ToPatches",
        kwargs: [["field", "ground_truth"]],
      },
    ];
    mocks.getSubset.mockResolvedValue({ id: "patches", view });
    navigate("?subset=patches");
    renderHook(useSubsetScopeUrl);
    await waitFor(() =>
      expect(mocks.openSubset).toHaveBeenCalledWith(
        "patches",
        "episodes",
        view,
        undefined,
      ),
    );
  });

  it("clears scope when switching to an unscoped conversion domain", () => {
    const { rerender } = renderHook(useSubsetScopeUrl);
    act(() => setBoundary({ subsetId: "one" }));
    act(() => {
      mocks.domainId = "dataset-a|clips";
      setBoundary({});
      rerender();
    });
    expect(window.location.search).toBe("");
    expect(localStorage.getItem(preference())).toBeNull();
  });

  it("retains the destination scope while a restored patch conversion loads", async () => {
    const view = [{ _cls: "fiftyone.core.stages.ToPatches", kwargs: [] }];
    mocks.getSubset.mockResolvedValue({ id: "patches", view });
    mocks.openSubset.mockImplementation(() => undefined);
    localStorage.setItem(preference(), JSON.stringify({ subsetId: "patches" }));
    const { rerender } = renderHook(useSubsetScopeUrl);
    await waitFor(() => expect(mocks.openSubset).toHaveBeenCalled());
    rerender();
    expect(window.location.search).toBe("?subset=patches");
    act(() => {
      mocks.domainId = "dataset-a|fiftyone.core.stages.ToPatches:[]";
      setBoundary({ subsetId: "patches", subsetScope: "episodes" });
      rerender();
    });
    expect(window.location.search).toBe("?subset=patches");
    expect(JSON.parse(localStorage.getItem(preference())!).subsetId).toBe(
      "patches",
    );
  });

  it("ignores a stale metadata response after a newer navigation", async () => {
    let resolve!: (value: SavedSubset) => void;
    mocks.getSubset.mockImplementationOnce(
      () =>
        new Promise<SavedSubset>((done) => {
          resolve = done;
        }),
    );
    navigate("?subset=slow");
    renderHook(useSubsetScopeUrl);
    act(() => navigate("?subset=fast"));
    await waitFor(() => expect(boundary.subsetId).toBe("fast"));
    await act(async () =>
      resolve({
        id: "slow",
        name: "Slow",
        counts: null,
        memberCount: 0,
        memberCounts: { fullEpisodes: 0, segments: 0 },
      }),
    );
    expect(boundary.subsetId).toBe("fast");
    expect(window.location.search).toBe("?subset=fast");
  });

  it("keeps unavailable subset links identifiable and escapable", async () => {
    mocks.getSubset.mockRejectedValue(new Error("Missing subset"));
    navigate("?subset=missing");
    renderHook(useSubsetScopeUrl);
    await waitFor(() => expect(boundary.subsetId).toBe("missing"));
    act(() => setBoundary({}));
    expect(window.location.search).toBe("");
  });

  it("cancels a pending restoration when All samples is chosen", async () => {
    let resolve!: (value: SavedSubset) => void;
    mocks.getSubset.mockImplementationOnce(
      () =>
        new Promise<SavedSubset>((done) => {
          resolve = done;
        }),
    );
    navigate("?subset=slow");
    renderHook(useSubsetScopeUrl);
    act(() => setBoundary({}));
    await act(async () =>
      resolve({
        id: "slow",
        name: "Slow",
        counts: null,
        memberCount: 0,
        memberCounts: { fullEpisodes: 0, segments: 0 },
      }),
    );
    expect(boundary.subsetId).toBeUndefined();
    expect(window.location.search).toBe("");
  });

  it("tolerates malformed and blocked local storage", async () => {
    localStorage.setItem(preference(), "{invalid");
    const hook = renderHook(useSubsetScopeUrl);
    expect(boundary).toEqual({});
    hook.unmount();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    navigate("?subset=linked");
    renderHook(useSubsetScopeUrl);
    await waitFor(() => expect(boundary.subsetId).toBe("linked"));
    expect(window.location.search).toBe("?subset=linked");
  });
});
