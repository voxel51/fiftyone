import type {
  EpisodeSelection,
  SelectionBoundary,
} from "@fiftyone/state/src/selection";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SamplesScopeTab from "./ScopeTab";

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
  setView: vi.fn(),
  request: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  getCounts: vi.fn(),
  remove: vi.fn(),
  start: vi.fn(),
}));
vi.mock("./SubsetJobs", () => ({ SubsetJobStatus: () => null }));
vi.mock("./useSubsetScopeUrl", () => ({ useSubsetScopeUrl: () => undefined }));
vi.mock("@fiftyone/state", () => ({
  useSetGroupSlice: () => vi.fn(),
  useGroupSlices: () => ["left", "right"],
  useSelectionSubsetDisabledReason: () => null,
  useDatasetSampleCount: () => 48,
  useClearTemporalTagConstraint: () => vi.fn(),
  useSetView: () => mocks.setView,
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
      resolveCaptured: async () => ({
        kind: "members",
        members: [...mocks.selection.selected.values()].flatMap(
          (group) => group.members,
        ),
      }),
    }),
    useGridSelectionDataset: () => mocks.selection,
    useGridSelectionBoundary: () => [mocks.boundary, mocks.setBoundary],
    useOpenSelectionBoundary: () => mocks.openBoundary,
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

beforeEach(() => {
  localStorage.clear();
  mocks.boundary = {};
  mocks.selection.conversion = null;
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
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SamplesScopeTab", () => {
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

  it("opens a patch subset from the samples view using its saved conversion", async () => {
    const view = [
      {
        _cls: "fiftyone.core.stages.ToPatches",
        kwargs: [["field", "ground_truth"]],
      },
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
    expect(mocks.openBoundary).toHaveBeenCalledWith(
      expect.stringContaining("ToPatches"),
      { subsetId: "patches", subsetScope: "episodes" },
    );
    expect(mocks.setView).toHaveBeenCalledWith(view);
  });

  it("keeps compatible view stages when opening a sample subset", async () => {
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
    expect(mocks.setView).not.toHaveBeenCalled();
  });
  it("names every sample with its count and opens a subset with a fresh selection", async () => {
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
    expect(mocks.selection.clear).toHaveBeenCalledTimes(1);
    expect(mocks.setBoundary).toHaveBeenCalledWith({
      subsetId: "hard",
      subsetScope: "episodes",
    });
  });

  it("confirms and deletes a subset when the list omits its counts", async () => {
    mocks.list.mockResolvedValue({
      subsets: [{ ...hard, counts: null }],
      total: 1,
      count: 1,
    });
    render(<SamplesScopeTab />);
    fireEvent.click(trigger());
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete Hard negatives" }),
    );
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
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete Hard negatives" }),
    );
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
    expect(trigger().textContent).toContain("48 samples");
    expect(mocks.get).toHaveBeenCalledWith("dataset", "hard");
    fireEvent.click(trigger());
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete Hard negatives" }),
    );
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
    expect(mocks.selection.clear).toHaveBeenCalled();
  });

  it("deletes an inactive subset without switching scope or clearing selection", async () => {
    mocks.boundary = { subsetId: "other", subsetScope: "episodes" };
    mocks.get.mockResolvedValue({ ...hard, id: "other", name: "Keep" });
    render(<SamplesScopeTab />);
    await waitFor(() => expect(trigger().textContent).toContain("Keep"));
    fireEvent.click(trigger());
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete Hard negatives" }),
    );
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
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete Hard negatives" }),
    );
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
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete Hard negatives" }),
    );
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not delete or remember the opt-out when confirmation is cancelled", async () => {
    render(<SamplesScopeTab />);
    fireEvent.click(trigger());
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete Hard negatives" }),
    );
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
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete Hard negatives" }),
    );
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
      fireEvent.click(
        await screen.findByRole("button", { name: "Delete Hard negatives" }),
      );
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

  it("saves all current results as a new subset from the tab", async () => {
    render(<SamplesScopeTab />);
    fireEvent.click(trigger());
    fireEvent.click(await screen.findByText("New subset…"));
    await screen.findByText("New subset from all 48 samples in view");
    await waitFor(() =>
      expect(mocks.selection.snapshot).toHaveBeenCalledTimes(1),
    );
    fireEvent.change(screen.getByLabelText("New subset name"), {
      target: { value: "Night drives" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create subset" }));
    await waitFor(() =>
      expect(mocks.start).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Night drives" }),
        expect.objectContaining({ snapshotId: "snap" }),
      ),
    );
  });

  it("shows episode cards before segment counts without recounting subset metadata", async () => {
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
    expect(trigger().textContent).toContain("4 episodes · 12 segments");
    expect(trigger().textContent).toContain("Segments");
    expect(mocks.getCounts).not.toHaveBeenCalled();
    expect(screen.queryByText("Unavailable subset")).toBeNull();
  });

  it.each([false, true])(
    "counts only visible parents and ranges with filtered=%s",
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
      expect(trigger().textContent).toContain("3 episodes · 10 segments");
    },
  );

  it("shows current results instead of the larger saved membership", async () => {
    mocks.selection.counts = { ...counts, episodes: 4, fullEpisodes: 4 };
    mocks.boundary = { subsetId: "hard", subsetScope: "episodes" };
    mocks.get.mockResolvedValue({
      ...hard,
      counts: { ...counts, episodes: 4, fullEpisodes: 4, unavailable: 12 },
    });
    render(<SamplesScopeTab />);
    await screen.findByText("Hard negatives");
    expect(trigger().textContent).toContain("4 samples");
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

it("leaves subset-owned materialization when returning to all samples", async () => {
  mocks.selection.subsetViewId = "hard";
  mocks.selection.domainId = "dataset|frames";
  mocks.boundary = { subsetId: "hard", subsetScope: "episodes" };
  render(<SamplesScopeTab />);
  fireEvent.click(trigger());
  fireEvent.click(await screen.findByRole("button", { name: /^All samples/ }));
  expect(mocks.openBoundary).toHaveBeenCalledWith("dataset", {
    subsetId: undefined,
    subsetScope: undefined,
  });
  expect(mocks.setView).toHaveBeenCalledWith([]);
});
