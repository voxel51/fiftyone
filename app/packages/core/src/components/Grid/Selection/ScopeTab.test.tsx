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
    snapshot: vi.fn(),
    clear: vi.fn(),
  },
  boundary: {} as SelectionBoundary,
  setBoundary: vi.fn(),
  request: vi.fn(),
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

const hard = { id: "hard", name: "Hard negatives", counts };
const trigger = () =>
  document.querySelector("[data-cy=samples-scope-trigger]") as HTMLElement;

beforeEach(() => {
  mocks.boundary = {};
  mocks.selection.selected = new Map();
  mocks.selection.snapshot.mockReset();
  mocks.selection.snapshot.mockResolvedValue({
    snapshotId: "snap",
    counts: all,
  });
  mocks.request.mockReset();
  mocks.request.mockImplementation(
    async (
      _dataset: string,
      path: string,
      body?: { phase?: string; name?: string; operationId?: string },
    ) => {
      if (!path && body === undefined) return { subsets: [hard] };
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
    expect(screen.getByText("Saved selection")).toBeTruthy();
    expect(screen.getByText("16")).toBeTruthy();
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
    await screen.findByText("48 samples");
    expect(mocks.selection.snapshot).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("New subset name"), {
      target: { value: "Night drives" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create subset" }));
    await screen.findByRole("status");
    expect(screen.getByText("Saved 48 members as Night drives.")).toBeTruthy();
    expect(mocks.request).toHaveBeenCalledWith(
      "dataset",
      "/add",
      expect.objectContaining({ phase: "prepare", snapshotId: "snap" }),
    );
  });
});
