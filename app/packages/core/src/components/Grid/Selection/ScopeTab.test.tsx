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
    unit: { one: "sample", many: "samples", temporal: false },
    enabled: true,
    selected: new Map<string, EpisodeSelection>(),
    counts: null as unknown,
    snapshot: vi.fn(),
    clear: vi.fn(),
  },
  boundary: {} as SelectionBoundary,
  setBoundary: vi.fn(),
  request: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@fiftyone/state", () => ({
  useDatasetSampleCount: () => 48,
  useClearTemporalTagConstraint: () => vi.fn(),
}));
vi.mock("@fiftyone/state/src/selection", async () => ({
  ...(await import("@fiftyone/state/src/selection/model")),
  ...(await import("@fiftyone/state/src/selection/hooks")),
  useGridSelection: () => mocks.selection,
  useGridSelectionDataset: () => mocks.selection,
  useGridSelectionBoundary: () => [mocks.boundary, mocks.setBoundary],
  useEpisodeSelectionActions: () => ({
    capture: vi.fn(),
    remove: vi.fn(),
    clear: mocks.selection.clear,
  }),
  subsetRequest: mocks.request,
  listSubsets: mocks.list,
  getSubset: mocks.get,
  deleteSubset: mocks.remove,
  scopeBody: (scope: {
    kind: string;
    members?: unknown;
    snapshotId?: string;
  }) =>
    scope.kind === "members"
      ? { members: scope.members }
      : { snapshotId: scope.snapshotId },
}));

const hard = {
  id: "hard",
  name: "Hard negatives",
  description: "Frames the model got wrong on the last run",
  counts,
};
const trigger = () =>
  document.querySelector("[data-cy=samples-scope-trigger]") as HTMLElement;

beforeEach(() => {
  mocks.boundary = {};
  mocks.selection.selected = new Map();
  mocks.selection.counts = all;
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
    expect(screen.getByText("16")).toBeTruthy();
    expect(screen.queryByLabelText("Search subsets")).toBeNull();
    fireEvent.click(row);
    expect(mocks.selection.clear).toHaveBeenCalledTimes(1);
    expect(mocks.setBoundary).toHaveBeenCalledWith({
      subsetId: "hard",
      subsetScope: "episodes",
    });
  });

  it("shows the open subset and deletes it back to every sample", async () => {
    mocks.boundary = { subsetId: "hard", subsetScope: "episodes" };
    render(<SamplesScopeTab />);
    await waitFor(() =>
      expect(trigger().textContent).toContain("Hard negatives"),
    );
    expect(trigger().textContent).toContain("16");
    expect(mocks.get).toHaveBeenCalledWith("dataset", "hard");
    fireEvent.click(trigger());
    fireEvent.click(await screen.findByText("Delete Hard negatives…"));
    await screen.findByText("Delete Hard negatives?");
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
    await screen.findByRole("status");
    expect(screen.getByText("Saved 48 samples as Night drives.")).toBeTruthy();
    expect(mocks.request).toHaveBeenCalledWith(
      "dataset",
      "/add",
      expect.objectContaining({ phase: "prepare", snapshotId: "snap" }),
    );
  });

  it("searches and pages the subsets on the server once there are more than five", async () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      id: `s${index}`,
      name: `Subset ${index}`,
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
