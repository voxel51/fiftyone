import type {
  EpisodeSelection,
  SelectionBoundary,
} from "@fiftyone/state/src/selection";
import {
  selectionDomainId,
  viewConversion,
} from "@fiftyone/state/src/selection/model";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SamplesScopeTab from "./ScopeTab";
import { SubsetDetailsContext } from "./SubsetDetailsContext";

const counts = {
  episodes: 16,
  fullEpisodes: 16,
  segments: 0,
  segmentEpisodes: 0,
  unavailable: 0,
};
const all = { ...counts, episodes: 48, fullEpisodes: 48 };
const mocks = vi.hoisted(() => ({
  selection: {
    datasetId: "dataset",
    domainId: "dataset",
    mediaType: "image",
    conversion: null as string | null,
    subsetViewId: undefined as string | undefined,
    unit: { one: "sample", many: "samples", temporal: false },
    enabled: true,
    request: { view: [] as readonly unknown[] },
    buckets: [{ id: "primary" }],
    target: "primary",
    selected: new Map<string, EpisodeSelection>(),
    counts: null as unknown,
    unavailableTotal: 0,
    snapshot: vi.fn(),
    clear: vi.fn(),
  },
  boundary: {} as SelectionBoundary,
  setBoundary: vi.fn(),
  openBoundary: vi.fn(),
  resetBoundaries: vi.fn(),
  setView: vi.fn(),
  clearViewConstraints: vi.fn(),
  holdCounts: vi.fn(),
  savedViewName: null as string | null,
  fieldVisibility: null as unknown,
  request: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  getCounts: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
  start: vi.fn(),
  resolveCaptured: vi.fn(),
}));
vi.mock("./SubsetJobs", () => ({ SubsetJobStatus: () => null }));
vi.mock("./useSubsetScopeUrl", () => ({ useSubsetScopeUrl: () => undefined }));
vi.mock("@fiftyone/state", () => ({
  useSetGroupSlice: () => vi.fn(),
  useGroupSlices: () => ["left", "right"],
  useSelectionSubsetDisabledReason: () => null,
  useLoadedSavedViewName: () => mocks.savedViewName,
  useSavedViewTransientState: () => ({
    fieldVisibility: mocks.fieldVisibility,
  }),
  useDatasetSampleCount: () => 48,
  useClearGridViewConstraints: () => mocks.clearViewConstraints,
  useHoldScopedCountsUntilNextPage: () => mocks.holdCounts,
  useSetView: () => mocks.setView,
  useView: () => mocks.selection.request.view,
}));
vi.mock("@fiftyone/state/src/selection", async () => {
  const awaitedModel = await import("@fiftyone/state/src/selection/model");
  return {
    useSubsetJobs: () => ({ jobs: [], start: mocks.start }),
    ...(await import("@fiftyone/state/src/selection/model")),
    ...(await import("@fiftyone/state/src/selection/hooks")),
    useGridSelection: () => ({
      ...mocks.selection,
      selectedCounts: awaitedModel.countSelection([
        ...mocks.selection.selected.values(),
      ]),
      resolveCaptured: mocks.resolveCaptured,
    }),
    useGridSelectionDataset: () => mocks.selection,
    useGridSelectionBoundary: () => [mocks.boundary, mocks.setBoundary],
    useOpenSelectionBoundary: () => mocks.openBoundary,
    useResetSelectionBoundaries: () => mocks.resetBoundaries,
    useSelectionBucketCommands: () => ({
      clearAll: mocks.selection.clear,
      removeEverywhere: vi.fn(),
      removeMembersEverywhere: vi.fn(),
    }),
    subsetRequest: mocks.request,
    listSubsets: mocks.list,
    getSubset: mocks.get,
    getSubsetCounts: mocks.getCounts,
    deleteSubset: mocks.remove,
    updateSubset: mocks.update,
    scopeBody: (scope: {
      kind: string;
      members?: unknown;
      snapshotId?: string;
    }) =>
      scope.kind === "members"
        ? { members: scope.members }
        : { snapshotId: scope.snapshotId },
  };
});

const hard = {
  id: "hard",
  name: "Hard negatives",
  description: "Frames the model got wrong on the last run",
  memberCount: counts.fullEpisodes,
  memberCounts: counts,
  counts,
};
const trigger = () =>
  document.querySelector("[data-cy=samples-scope-trigger]") as HTMLElement;

const requestDeleteSubset = async () => {
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit Hard negatives" }),
  );
  fireEvent.click(await screen.findByRole("button", { name: "Delete subset" }));
};

beforeEach(() => {
  localStorage.clear();
  mocks.boundary = {};
  mocks.savedViewName = null;
  mocks.fieldVisibility = null;
  mocks.selection.conversion = null;
  mocks.selection.mediaType = "image";
  mocks.selection.subsetViewId = undefined;
  mocks.selection.domainId = "dataset";
  mocks.selection.unit = { one: "sample", many: "samples", temporal: false };
  mocks.selection.request.view = [];
  mocks.selection.selected = new Map();
  mocks.selection.counts = all;
  mocks.selection.unavailableTotal = 0;
  mocks.selection.snapshot.mockReset();
  mocks.selection.snapshot.mockResolvedValue({
    snapshotId: "snap",
    counts: all,
  });
  mocks.resolveCaptured.mockReset();
  mocks.resolveCaptured.mockImplementation(async () => ({
    kind: "members",
    members: [...mocks.selection.selected.values()].flatMap(
      (group) => group.members,
    ),
  }));
  mocks.list.mockReset();
  mocks.list.mockResolvedValue({ subsets: [hard], total: 1, count: 1 });
  mocks.get.mockReset();
  mocks.get.mockResolvedValue(hard);
  mocks.request.mockReset();
  mocks.request.mockImplementation(
    async (
      _dataset: string,
      path: string,
      body?: { phase?: string; name?: string; operationId?: string },
    ) => {
      if (!path) return { id: "created", name: body?.name, counts: all };
      return {
        operationId: body?.operationId,
        subsetId: "created",
        counts: all,
        added: 48,
        duplicates: 0,
        provenanceUpdated: 0,
      };
    },
  );
  mocks.remove.mockReset();
  mocks.remove.mockResolvedValue({ id: "hard" });
  mocks.update.mockReset();
  mocks.update.mockImplementation(async (_dataset, _id, info) => ({
    ...hard,
    ...info,
  }));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SamplesScopeTab", () => {
  it("renders host details only for the active subset", async () => {
    mocks.boundary = { subsetId: hard.id, subsetScope: "episodes" };
    mocks.get.mockResolvedValue({
      ...hard,
      created_by: "creator-id",
      created_at: "2026-09-12T12:00:00Z",
    });
    mocks.list.mockResolvedValue({
      subsets: [
        hard,
        {
          ...hard,
          id: "other",
          name: "Other subset",
          created_by: "other-creator",
        },
      ],
      total: 2,
      count: 2,
    });
    const Details = ({ subset }: { subset: { id: string } }) => (
      <span>Details for {subset.id}</span>
    );
    render(
      <SubsetDetailsContext.Provider value={Details}>
        <SamplesScopeTab />
      </SubsetDetailsContext.Provider>,
    );
    await waitFor(() => expect(trigger().textContent).toContain(hard.name));
    fireEvent.click(trigger());
    await screen.findByText(`Details for ${hard.id}`);
    expect(screen.queryByText("Details for other")).toBeNull();
  });

  it("says which saved queries the open subset was captured from", async () => {
    const capture = (id: string, name: string) => ({
      operationId: id,
      capturedAt: null,
      capturedBy: null,
      added: 1,
      savedView: { id, name, slug: name.toLowerCase() },
      view: null,
    });
    mocks.boundary = { subsetId: hard.id, subsetScope: "episodes" };
    mocks.get.mockResolvedValue({
      ...hard,
      captures: [
        capture("q2", "Dusk"),
        { ...capture("q1", "Night"), savedView: null },
        capture("q1", "Night"),
        capture("q2", "Dusk"),
      ],
    });
    render(<SamplesScopeTab />);
    await waitFor(() => expect(trigger().textContent).toContain(hard.name));
    fireEvent.click(trigger());

    expect(
      await screen.findByText("From saved queries “Dusk” and 1 more"),
    ).toBeTruthy();
  });

  it.each([
    ["patches", "ToPatches"],
    ["frames", "ToFrames"],
    ["clips", "ToClips"],
  ])(
    "browses all subsets from a %s view and opens a sample subset",
    async (conversion, stage) => {
      const view = [
        {
          _cls: `fiftyone.core.stages.${stage}`,
          kwargs: [["field", "ground_truth"]],
        },
      ];
      mocks.selection.conversion = conversion;
      mocks.selection.domainId = `dataset|fiftyone.core.stages.${stage}`;
      mocks.selection.request.view = view;
      render(<SamplesScopeTab />);
      fireEvent.click(trigger());
      await screen.findByText("Hard negatives");
      expect(mocks.list).toHaveBeenLastCalledWith("dataset", {
        search: undefined,
        skip: 0,
        limit: 5,
      });
      expect(
        screen
          .getByRole("button", { name: /New subset/ })
          .hasAttribute("disabled"),
      ).toBe(false);
      fireEvent.click(screen.getByRole("button", { name: /^Hard negatives/ }));
      expect(mocks.openBoundary).toHaveBeenCalledWith("dataset", {
        subsetId: "hard",
        subsetScope: "episodes",
      });
      expect(mocks.setView).toHaveBeenCalledWith([]);
    },
  );

  it.each(["samples", "patches"])(
    "opens a patch subset from filtered %s using only its saved conversion",
    async (scope) => {
      const view = [
        {
          _cls: "fiftyone.core.stages.ToPatches",
          kwargs: [["field", "ground_truth"]],
        },
      ];
      if (scope === "patches") {
        mocks.selection.conversion = "patches";
        mocks.selection.domainId = selectionDomainId(
          "dataset",
          viewConversion(view)!.key,
        );
      }
      mocks.selection.request.view = [
        ...(scope === "patches" ? view : []),
        { _cls: "fiftyone.core.stages.Limit", kwargs: [["limit", 10]] },
      ];
      mocks.list.mockResolvedValue({
        subsets: [hard, { ...hard, id: "patches", name: "Bird patches", view }],
        total: 2,
        count: 2,
      });
      render(<SamplesScopeTab />);
      fireEvent.click(trigger());
      await screen.findByText("Hard negatives");
      expect(screen.getByText("16 patches")).toBeTruthy();
      expect(screen.getByText("16 samples")).toBeTruthy();
      fireEvent.click(
        await screen.findByRole("button", { name: /^Bird patches/ }),
      );
      const boundary = { subsetId: "patches", subsetScope: "episodes" };
      if (scope === "patches")
        expect(mocks.setBoundary).toHaveBeenCalledWith(boundary);
      else
        expect(mocks.openBoundary).toHaveBeenCalledWith(
          expect.stringContaining("ToPatches"),
          boundary,
        );
      expect(mocks.setView).toHaveBeenCalledWith(view);
      expect(mocks.clearViewConstraints).toHaveBeenCalledOnce();
    },
  );

  it("opens an unconverted subset without replacing an unchanged grid view", async () => {
    render(<SamplesScopeTab />);
    fireEvent.click(trigger());
    fireEvent.click(
      await screen.findByRole("button", { name: /^Hard negatives/ }),
    );
    expect(mocks.setBoundary).toHaveBeenCalledWith({
      subsetId: "hard",
      subsetScope: "episodes",
    });
    expect(mocks.clearViewConstraints).toHaveBeenCalledOnce();
    expect(mocks.setView).not.toHaveBeenCalled();
    expect(mocks.holdCounts).not.toHaveBeenCalled();
  });

  it.each(["saved query", "field visibility"])(
    "resets %s even when the view stages match the subset",
    async (constraint) => {
      if (constraint === "saved query") mocks.savedViewName = "Empty query";
      else mocks.fieldVisibility = { kwargs: { field_names: ["filepath"] } };
      render(<SamplesScopeTab />);
      fireEvent.click(trigger());
      fireEvent.click(
        await screen.findByRole("button", { name: /^Hard negatives/ }),
      );
      expect(mocks.setView).toHaveBeenCalledWith([]);
      expect(mocks.holdCounts).toHaveBeenCalledOnce();
    },
  );

  it("clears the source view stages when opening a sample subset", async () => {
    mocks.selection.request.view = [
      { _cls: "fiftyone.core.stages.Limit", kwargs: [["limit", 10]] },
    ];
    render(<SamplesScopeTab />);
    fireEvent.click(trigger());
    fireEvent.click(
      await screen.findByRole("button", { name: /^Hard negatives/ }),
    );
    expect(mocks.list).toHaveBeenLastCalledWith("dataset", {
      search: undefined,
      skip: 0,
      limit: 5,
    });
    expect(mocks.setBoundary).toHaveBeenCalledWith({
      subsetId: "hard",
      subsetScope: "episodes",
    });
    expect(mocks.setView).toHaveBeenCalledWith([]);
    expect(mocks.clearViewConstraints).toHaveBeenCalledOnce();
    // the view changes, so counts wait for the page that carries it
    expect(mocks.holdCounts).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    "clears the filtered samples view when choosing All samples with subset=%s",
    async (subset) => {
      mocks.boundary = subset ? { subsetId: hard.id } : {};
      mocks.selection.request.view = [
        { _cls: "fiftyone.core.stages.Limit", kwargs: [["limit", 10]] },
      ];
      render(<SamplesScopeTab />);
      fireEvent.click(trigger());
      fireEvent.click(
        await screen.findByRole("button", { name: /^All samples/ }),
      );
      expect(mocks.setBoundary).toHaveBeenCalledWith({
        subsetId: undefined,
        subsetScope: undefined,
      });
      expect(mocks.setView).toHaveBeenCalledWith([]);
      expect(mocks.clearViewConstraints).toHaveBeenCalledOnce();
    },
  );
  it("names every sample with its count and opens a subset without clearing captures", async () => {
    render(<SamplesScopeTab />);
    expect(trigger().textContent).toContain("All samples");
    expect(trigger().textContent).toContain("48");
    fireEvent.click(trigger());
    const row = await screen.findByText("Hard negatives");
    expect(
      screen.getByText("Frames the model got wrong on the last run"),
    ).toBeTruthy();
    expect(screen.queryByText("Saved selection")).toBeNull();
    expect(screen.getByText("16 samples")).toBeTruthy();
    expect(screen.queryByLabelText("Search subsets")).toBeNull();
    fireEvent.click(row);
    expect(mocks.selection.clear).not.toHaveBeenCalled();
    expect(mocks.setBoundary).toHaveBeenCalledWith({
      subsetId: "hard",
      subsetScope: "episodes",
    });
  });

  it("edits the active subset without changing scope or selection", async () => {
    mocks.boundary = { subsetId: hard.id, subsetScope: "episodes" };
    const updated = { ...hard, name: "Reviewed", description: null };
    mocks.update.mockImplementation(async () => {
      mocks.list.mockResolvedValue({ subsets: [updated], total: 1, count: 1 });
      mocks.get.mockResolvedValue(updated);
      return updated;
    });
    render(<SamplesScopeTab />);
    await waitFor(() => expect(trigger().textContent).toContain(hard.name));
    fireEvent.click(trigger());
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit Hard negatives" }),
    );
    expect(
      (screen.getByLabelText("Subset name") as HTMLInputElement).value,
    ).toBe(hard.name);
    expect(
      (screen.getByLabelText("Description") as HTMLTextAreaElement).value,
    ).toBe(hard.description);
    expect(
      screen
        .getByRole("button", { name: "Save changes" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Subset name"), {
      target: { value: " Reviewed " },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: " " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.update).toHaveBeenCalledWith("dataset", "hard", {
      name: "Reviewed",
      description: null,
    });
    await waitFor(() => expect(trigger().textContent).toContain("Reviewed"));
    expect(mocks.setBoundary).not.toHaveBeenCalled();
    expect(mocks.selection.clear).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("keeps failed edits for retry and rejects a blank name", async () => {
    mocks.update.mockRejectedValueOnce(new Error("Connection interrupted"));
    render(<SamplesScopeTab />);
    fireEvent.click(trigger());
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit Hard negatives" }),
    );
    fireEvent.change(screen.getByLabelText("Subset name"), {
      target: { value: " " },
    });
    expect(
      screen
        .getByRole("button", { name: "Save changes" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Subset name"), {
      target: { value: "Reviewed" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: " Ready to review " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Connection interrupted",
    );
    expect(
      (screen.getByLabelText("Subset name") as HTMLInputElement).value,
    ).toBe("Reviewed");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(mocks.update).toHaveBeenLastCalledWith("dataset", "hard", {
      name: "Reviewed",
      description: "Ready to review",
    });
  });

  it("discards cancelled edits without writing metadata", async () => {
    render(<SamplesScopeTab />);
    fireEvent.click(trigger());
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit Hard negatives" }),
    );
    fireEvent.change(screen.getByLabelText("Subset name"), {
      target: { value: "Discard me" },
    });
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("confirms and deletes a subset when the list omits its counts", async () => {
    mocks.list.mockResolvedValue({
      subsets: [{ ...hard, counts: null }],
      total: 1,
      count: 1,
    });
    render(<SamplesScopeTab />);
    fireEvent.click(trigger());
    await requestDeleteSubset();
    await screen.findByRole("heading", { name: "Delete Hard negatives" });
    expect(
      screen.getByText(
        "This removes the saved selection of 16 samples. Samples, media, annotations, and tags stay.",
      ),
    ).toBeTruthy();
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mocks.remove).not.toHaveBeenCalled();

    fireEvent.click(trigger());
    await requestDeleteSubset();
    fireEvent.click(screen.getByRole("button", { name: "Delete subset" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.remove).toHaveBeenCalledWith("dataset", "hard");
  });

  it("shows the open subset and deletes it back to every sample", async () => {
    mocks.boundary = { subsetId: "hard", subsetScope: "episodes" };
    render(<SamplesScopeTab />);
    await waitFor(() =>
      expect(trigger().textContent).toContain("Hard negatives"),
    );
    expect(trigger().textContent).not.toContain("48 samples");
    expect(mocks.get).toHaveBeenCalledWith("dataset", "hard");
    fireEvent.click(trigger());
    await requestDeleteSubset();
    const heading = await screen.findByRole("heading", {
      name: "Delete Hard negatives",
    });
    expect(heading.querySelector("i")?.textContent).toBe("Hard negatives");
    expect(screen.queryByText("Delete Hard negatives?")).toBeNull();
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Delete subset" }));
    await waitFor(() =>
      expect(mocks.remove).toHaveBeenCalledWith("dataset", "hard"),
    );
    await waitFor(() =>
      expect(mocks.setBoundary).toHaveBeenCalledWith({
        subsetId: undefined,
        subsetScope: undefined,
      }),
    );
    expect(mocks.selection.clear).not.toHaveBeenCalled();
  });

  it("deletes an inactive subset without switching scope or clearing selection", async () => {
    mocks.boundary = { subsetId: "other", subsetScope: "episodes" };
    mocks.get.mockResolvedValue({ ...hard, id: "other", name: "Keep" });
    render(<SamplesScopeTab />);
    await waitFor(() => expect(trigger().textContent).toContain("Keep"));
    fireEvent.click(trigger());
    await requestDeleteSubset();
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete subset" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.remove).toHaveBeenCalledWith("dataset", "hard");
    expect(mocks.setBoundary).not.toHaveBeenCalled();
    expect(mocks.selection.clear).not.toHaveBeenCalled();
  });

  it("remembers the confirmation opt-out after deletion across mounts", async () => {
    const view = render(<SamplesScopeTab />);
    fireEvent.click(trigger());
    await requestDeleteSubset();
    fireEvent.click(
      await screen.findByRole("checkbox", {
        name: "Don't ask for confirmation again",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete subset" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      localStorage.getItem("fiftyone.subsets.skipDeleteConfirmation.v1"),
    ).toBe("true");
    view.unmount();
    render(<SamplesScopeTab />);
    fireEvent.click(trigger());
    await requestDeleteSubset();
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not delete or remember the opt-out when confirmation is cancelled", async () => {
    render(<SamplesScopeTab />);
    fireEvent.click(trigger());
    await requestDeleteSubset();
    fireEvent.click(
      await screen.findByRole("checkbox", {
        name: "Don't ask for confirmation again",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(
      localStorage.getItem("fiftyone.subsets.skipDeleteConfirmation.v1"),
    ).toBeNull();
  });

  it("surfaces a skipped-confirmation failure with a retry", async () => {
    localStorage.setItem("fiftyone.subsets.skipDeleteConfirmation.v1", "true");
    mocks.remove.mockRejectedValueOnce(new Error("Connection interrupted"));
    render(<SamplesScopeTab />);
    fireEvent.click(trigger());
    await requestDeleteSubset();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Connection interrupted",
    );
    expect(mocks.setBoundary).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete subset" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.remove).toHaveBeenCalledTimes(2);
  });

  it("still confirms and deletes when browser storage is unavailable", async () => {
    const read = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("Storage blocked");
      });
    const write = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("Storage blocked");
      });
    try {
      render(<SamplesScopeTab />);
      fireEvent.click(trigger());
      await requestDeleteSubset();
      expect(mocks.remove).not.toHaveBeenCalled();
      fireEvent.click(
        await screen.findByRole("checkbox", {
          name: "Don't ask for confirmation again",
        }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Delete subset" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(mocks.remove).toHaveBeenCalledOnce();
    } finally {
      read.mockRestore();
      write.mockRestore();
    }
  });

  it.each([
    ["unselected grid", false, false, "image"],
    ["selected grid", true, false, "image"],
    ["selected subset", true, true, "image"],
    ["selected grouped grid", true, false, "group"],
  ] as const)(
    "creates an empty subset from the %s",
    async (_label, selected, scoped, mediaType) => {
      mocks.selection.mediaType = mediaType;
      if (selected) {
        mocks.selection.selected.set("sample", {
          episodeId: "sample",
          members: [{ episodeId: "sample", kind: "episode" }],
        });
      }
      if (scoped)
        mocks.boundary = { subsetId: hard.id, subsetScope: "episodes" };
      render(<SamplesScopeTab />);
      fireEvent.click(trigger());
      fireEvent.click(
        await screen.findByRole("button", { name: "New subset…", exact: true }),
      );
      await screen.findByText("New subset");
      expect(screen.getByText("Empty subset")).toBeTruthy();
      expect(
        screen.getByText("No samples yet — add them from the grid later"),
      ).toBeTruthy();
      expect(screen.queryByRole("radio")).toBeNull();
      expect(screen.getByPlaceholderText("Subset name")).toBeTruthy();
      expect(mocks.selection.snapshot).not.toHaveBeenCalled();
      expect(mocks.resolveCaptured).not.toHaveBeenCalled();
      fireEvent.change(screen.getByLabelText("New subset name"), {
        target: { value: "Night drives" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save subset" }));
      await waitFor(() =>
        expect(mocks.request).toHaveBeenCalledWith(
          "dataset",
          "",
          expect.objectContaining({ name: "Night drives" }),
        ),
      );
      await waitFor(() =>
        expect(screen.queryByLabelText("New subset name")).toBeNull(),
      );
      expect(mocks.start).not.toHaveBeenCalled();
      expect(mocks.selection.selected.size).toBe(selected ? 1 : 0);
      expect(mocks.selection.clear).not.toHaveBeenCalled();
    },
  );

  it("shows the saved segment scope without recounting subset metadata", async () => {
    mocks.selection.unit = { one: "episode", many: "episodes", temporal: true };
    mocks.selection.counts = {
      ...counts,
      episodes: 4,
      fullEpisodes: 0,
      segments: 12,
      segmentEpisodes: 4,
    };
    mocks.boundary = { subsetId: "large", subsetScope: "segments" };
    mocks.get.mockResolvedValue({
      id: "large",
      name: "Large ranges",
      counts: null,
      kinds: ["segment"],
      memberCount: 12000,
      memberCounts: { fullEpisodes: 0, segments: 12000 },
    });
    render(<SamplesScopeTab />);
    await screen.findByText("Large ranges");
    expect(trigger().textContent).not.toContain("4 episodes · 12 segments");
    expect(trigger().textContent).toContain("Segments");
    expect(mocks.getCounts).not.toHaveBeenCalled();
    expect(screen.queryByText("Unavailable subset")).toBeNull();
  });

  it.each([false, true])(
    "hides subset counts with filtered=%s",
    async (filtered) => {
      mocks.selection.unit = {
        one: "episode",
        many: "episodes",
        temporal: true,
      };
      mocks.boundary = { subsetId: "hard", subsetScope: "segments" };
      mocks.selection.unavailableTotal = 1;
      mocks.selection.request.view = filtered
        ? [{ _cls: "fiftyone.core.stages.Match" }]
        : [];
      mocks.selection.counts = {
        ...counts,
        episodes: filtered ? 3 : 4,
        fullEpisodes: 0,
        segments: filtered ? 10 : 12,
        segmentEpisodes: filtered ? 3 : 4,
        unavailable: filtered ? 0 : 2,
      };
      render(<SamplesScopeTab />);
      await screen.findByText("Hard negatives");
      expect(trigger().textContent).not.toContain("3 episodes · 10 segments");
    },
  );

  it("hides subset counts even when current results have fewer members", async () => {
    mocks.selection.counts = { ...counts, episodes: 4, fullEpisodes: 4 };
    mocks.boundary = { subsetId: "hard", subsetScope: "episodes" };
    mocks.get.mockResolvedValue({
      ...hard,
      counts: { ...counts, episodes: 4, fullEpisodes: 4, unavailable: 12 },
    });
    render(<SamplesScopeTab />);
    await screen.findByText("Hard negatives");
    expect(trigger().textContent).not.toContain("4 samples");
    expect(mocks.getCounts).not.toHaveBeenCalled();
  });

  it("shows stored counts for both kinds in a mixed subset", async () => {
    mocks.list.mockResolvedValue({
      subsets: [
        {
          id: "mixed",
          name: "Mixed",
          counts: null,
          memberCount: 5,
          memberCounts: { fullEpisodes: 2, segments: 3 },
        },
      ],
      total: 1,
      count: 1,
    });
    render(<SamplesScopeTab />);
    fireEvent.click(trigger());
    expect(
      await screen.findByRole("button", {
        name: "Mixed Whole samples 2 samples",
      }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Mixed Segments 3 segments" }),
    );
    expect(mocks.setBoundary).toHaveBeenCalledWith({
      subsetId: "mixed",
      subsetScope: "segments",
    });
    expect(mocks.getCounts).not.toHaveBeenCalled();
  });

  it("opens segment-only subsets before their expensive live counts are known", async () => {
    mocks.list.mockResolvedValue({
      subsets: [
        {
          id: "large",
          name: "Large ranges",
          counts: null,
          kinds: ["segment"],
          memberCount: 12000,
          memberCounts: { fullEpisodes: 0, segments: 12000 },
        },
      ],
      total: 1,
      count: 1,
    });
    render(<SamplesScopeTab />);
    fireEvent.click(trigger());
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Large ranges 12,000 segments",
      }),
    );
    expect(mocks.setBoundary).toHaveBeenCalledWith({
      subsetId: "large",
      subsetScope: "segments",
    });
  });

  it("searches and pages the subsets on the server once there are more than five", async () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      id: `s${index}`,
      name: `Subset ${index}`,
      memberCount: counts.fullEpisodes,
      memberCounts: counts,
      counts,
    }));
    mocks.list.mockImplementation(
      async (
        _dataset: string,
        options: { search?: string; skip?: number; limit?: number } = {},
      ) => {
        const matching = options.search
          ? many.filter((subset) => subset.name.includes(options.search ?? ""))
          : many;
        const skip = options.skip ?? 0;
        return {
          subsets: matching.slice(skip, skip + (options.limit ?? 5)),
          total: matching.length,
          count: many.length,
        };
      },
    );
    render(<SamplesScopeTab />);
    fireEvent.click(trigger());
    const search = await screen.findByPlaceholderText("Search 12 subsets");
    expect(await screen.findByText("Subset 0")).toBeTruthy();
    expect(screen.getByText("Subset 4")).toBeTruthy();
    expect(screen.queryByText("Subset 5")).toBeNull();
    expect(screen.getByText("1–5 of 12")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next subsets" }));
    expect(await screen.findByText("Subset 5")).toBeTruthy();
    expect(screen.getByText("6–10 of 12")).toBeTruthy();
    expect(mocks.list).toHaveBeenLastCalledWith("dataset", {
      search: undefined,
      skip: 5,
      limit: 5,
    });
    fireEvent.change(search, { target: { value: "Subset 1" } });
    expect(await screen.findByText("Subset 10")).toBeTruthy();
    expect(screen.getByText("Subset 11")).toBeTruthy();
    expect(screen.queryByText("Subset 2")).toBeNull();
    expect(screen.queryByText(/of 3$/)).toBeNull();
    expect(mocks.list).toHaveBeenLastCalledWith("dataset", {
      search: "Subset 1",
      skip: 0,
      limit: 5,
    });
  });
});

it.each([
  ["ToPatches", undefined],
  ["ToEvaluationPatches", undefined],
  ["ToFrames", undefined],
  ["ToClips", undefined],
  ["ToTrajectories", undefined],
  ["ToFrames", "hard"],
])(
  "leaves %s with subset=%s when returning to All samples",
  async (stage, subsetId) => {
    mocks.selection.subsetViewId = subsetId;
    mocks.selection.domainId = `dataset|${stage}`;
    mocks.selection.request.view = [
      { _cls: `fiftyone.core.stages.${stage}`, kwargs: [] },
      { _cls: "fiftyone.core.stages.Limit", kwargs: [["limit", 10]] },
    ];
    mocks.boundary = { subsetId, subsetScope: "episodes" };
    render(<SamplesScopeTab />);
    fireEvent.click(trigger());
    fireEvent.click(
      await screen.findByRole("button", { name: /^All samples/ }),
    );
    expect(mocks.openBoundary).toHaveBeenCalledWith("dataset", {
      subsetId: undefined,
      subsetScope: undefined,
    });
    // no subset stays behind with the view kind it left
    expect(mocks.resetBoundaries).toHaveBeenCalledWith("dataset");
    expect(mocks.setView).toHaveBeenCalledWith([]);
    expect(mocks.clearViewConstraints).toHaveBeenCalledOnce();
  },
);
