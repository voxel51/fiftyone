import {
  registerGridSelectionAction,
  type GridSelectionAction,
  type GridSelectionActionProps,
} from "@fiftyone/multimodal/extensions/grid-selection";
import {
  countSelection,
  type EpisodeSelection,
  type SelectionCounts,
} from "@fiftyone/state/src/selection";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { TagIcon } from "@voxel51/voodo";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ActionEntry from "./ActionEntry";
import SelectionTray from "./SelectionTray";

function segment(start: string, end: string) {
  return {
    episodeId: "seg",
    kind: "segment" as const,
    range: {
      start,
      end,
      timebase: "sequence",
      streams: ["filepath"],
      provenance: [],
    },
  };
}
const fullEpisode: EpisodeSelection = {
  episodeId: "full",
  filepath: "/videos/full.mp4",
  members: [{ episodeId: "full", kind: "episode" }],
};
const segmentEpisode: EpisodeSelection = {
  episodeId: "seg",
  filepath: "/videos/seg.mp4",
  members: [segment("10", "30"), segment("60", "75")],
};

const mocks = vi.hoisted(() => ({
  setExpandedSample: vi.fn(async () => undefined),
  setModalState: vi.fn(async () => undefined),
  selection: {
    datasetId: "dataset",
    domainId: "dataset",
    mediaType: "video",
    conversion: null,
    unit: { one: "episode", many: "episodes", temporal: true },
    enabled: true,
    selected: new Map<string, EpisodeSelection>(),
    candidates: new Map<string, EpisodeSelection | null>(),
    counts: null as SelectionCounts | null,
    unavailableGroups: [] as EpisodeSelection[],
    loading: false,
    error: null as string | null,
    request: { view: [] },
    capture: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    toggle: vi.fn(),
    select: vi.fn(),
    snapshot: vi.fn(),
  },
  invalidate: vi.fn(),
}));

vi.mock("@fiftyone/state", () => ({
  useGridViewScope: () => ({ refresh: 0 }),
  useClearTemporalTagConstraint: () => vi.fn(),
  useSetExpandedSample: () => mocks.setExpandedSample,
  useSetModalState: () => mocks.setModalState,
  useRefresh: () => vi.fn(),
  useSelectionTagDisabledReason: () => null,
  useSetView: () => vi.fn(),
  getSampleSrc: (path: string) => path,
}));
vi.mock("@fiftyone/state/src/selection", async () => ({
  ...(await import("@fiftyone/state/src/selection/model")),
  ...(await import("@fiftyone/state/src/selection/hooks")),
  ...(await import("@fiftyone/state/src/selection/fold")),
  useGridSelection: () => mocks.selection,
  useGridSelectionDataset: () => mocks.selection,
  useGridSelectionBoundary: () => [{}, vi.fn()],
  useInvalidateSelectionScope: () => mocks.invalidate,
  getSelectionProviders: vi.fn(async () => ({
    eventFields: ["events"],
    temporalTags: [],
  })),
  resolveSelection: vi.fn(async () => ({ groups: [], counts: {} })),
  createSelectionSnapshot: vi.fn(),
  subsetRequest: vi.fn(async () => ({ subsets: [] })),
  selectionTagsRequest: vi.fn(async () => ({ tags: [] })),
  scopeBody: (scope: {
    kind: string;
    members?: unknown;
    snapshotId?: string;
  }) =>
    scope.kind === "members"
      ? { members: scope.members }
      : { snapshotId: scope.snapshotId },
}));

beforeEach(() => {
  mocks.selection.selected = new Map();
  mocks.selection.candidates = new Map();
  mocks.selection.counts = null;
  mocks.selection.loading = false;
  mocks.selection.error = null;
  mocks.selection.clear.mockClear();
  mocks.selection.capture.mockClear();
  mocks.selection.snapshot.mockReset();
  mocks.invalidate.mockClear();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SelectionTray", () => {
  it("states the all-results scope from exact counts, with loading and retryable errors", async () => {
    mocks.selection.counts = countSelection([fullEpisode, segmentEpisode]);
    const view = render(<SelectionTray />);
    expect(screen.getByText("Act on all episodes in the grid")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /selected episodes/ }),
    ).toBeNull();

    mocks.selection.loading = true;
    mocks.selection.counts = null;
    view.rerender(<SelectionTray />);
    expect(screen.getByText("Act on all episodes in the grid")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Add to subset" })
        .hasAttribute("disabled"),
    ).toBe(true);

    mocks.selection.loading = false;
    mocks.selection.error = "Selection requires an episode-preserving view";
    view.rerender(<SelectionTray />);
    expect(screen.getByRole("alert").textContent).toContain(
      "episode-preserving",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.invalidate).toHaveBeenCalledOnce();
    view.unmount();
  });

  it("freezes all results as a server snapshot when an action opens", async () => {
    mocks.selection.counts = countSelection([fullEpisode]);
    mocks.selection.snapshot.mockResolvedValue({
      snapshotId: "snap",
      counts: countSelection([fullEpisode]),
    });
    render(<SelectionTray />);
    fireEvent.click(screen.getByRole("button", { name: "Add to subset" }));
    expect(mocks.selection.snapshot).toHaveBeenCalledOnce();
    await screen.findByText(/in view to subset$/);
  });

  it("separates card counts from member scope and flags episodes outside the results", () => {
    mocks.selection.selected = new Map([
      ["full", fullEpisode],
      ["seg", segmentEpisode],
    ]);
    mocks.selection.candidates = new Map([
      ["full", fullEpisode],
      ["seg", null],
    ]);
    render(<SelectionTray />);
    expect(
      screen.getByText("1 full episode · 2 segments across 1 episode selected"),
    ).toBeTruthy();
    expect(screen.getByText("· 1 episode not in current results")).toBeTruthy();
    expect(screen.getByText("Not in results")).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("opens a card with its group and walks the captured cards from the modal", async () => {
    const grouped = { ...fullEpisode, groupId: "group-a" };
    mocks.selection.selected = new Map([
      ["full", grouped],
      ["seg", segmentEpisode],
    ]);
    mocks.selection.candidates = new Map([
      ["full", grouped],
      ["seg", segmentEpisode],
    ]);
    render(<SelectionTray />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open full.mp4" }));
    });
    expect(mocks.setExpandedSample).toHaveBeenCalledWith({
      id: "full",
      groupId: "group-a",
      hasNext: true,
      hasPrevious: false,
    });
    const [navigation] = mocks.setModalState.mock.calls[0] as unknown as [
      {
        next: () => Promise<unknown>;
        previous: () => Promise<unknown>;
        peek: (offset: number) => Promise<unknown>;
      },
    ];
    await expect(navigation.next()).resolves.toEqual({
      id: "seg",
      groupId: undefined,
      hasNext: false,
      hasPrevious: true,
    });
    await expect(navigation.next()).resolves.toMatchObject({ id: "seg" });
    await expect(navigation.previous()).resolves.toEqual({
      id: "full",
      groupId: "group-a",
      hasNext: true,
      hasPrevious: false,
    });
    await expect(navigation.peek(1)).resolves.toBeNull();
  });

  it("folds long selections to their first and last cards and reveals more in chunks", () => {
    const many: EpisodeSelection[] = Array.from({ length: 120 }, (_, i) => ({
      episodeId: `e${i}`,
      filepath: `/videos/e${i}.mp4`,
      members: [{ episodeId: `e${i}`, kind: "episode" as const }],
    }));
    mocks.selection.selected = new Map(many.map((g) => [g.episodeId, g]));
    mocks.selection.candidates = new Map(many.map((g) => [g.episodeId, g]));
    render(<SelectionTray />);
    expect(screen.getAllByRole("article")).toHaveLength(100);
    expect(screen.getByText("e49.mp4")).toBeTruthy();
    expect(screen.queryByText("e50.mp4")).toBeNull();
    expect(screen.getByText("e70.mp4")).toBeTruthy();
    expect(screen.getByText("120 episodes selected")).toBeTruthy();
    const fold = screen.getByRole("button", {
      name: "Show 20 more of 20 hidden episodes",
    });
    expect(fold.textContent).toContain("20 more");
    fireEvent.click(fold);
    expect(screen.getAllByRole("article")).toHaveLength(120);
    expect(
      screen.queryByRole("button", { name: /hidden episodes/ }),
    ).toBeNull();
  });

  it("does not flag captured parents whose details are still unknown", () => {
    mocks.selection.selected = new Map([["full", fullEpisode]]);
    mocks.selection.candidates = new Map();
    render(<SelectionTray />);
    expect(screen.queryByText(/not in current results/)).toBeNull();
    expect(screen.queryByText("Not in results")).toBeNull();
  });

  it("collapses the strip without touching the selection, and clears separately", () => {
    mocks.selection.selected = new Map([["full", fullEpisode]]);
    mocks.selection.candidates = new Map([["full", fullEpisode]]);
    render(<SelectionTray />);
    const toggle = screen.getByRole("button", {
      name: "Hide selected episodes",
    });
    const strip = document.getElementById(
      toggle.getAttribute("aria-controls") ?? "",
    );
    expect(strip).toBeTruthy();
    expect(screen.getByRole("separator")).toBeTruthy();
    fireEvent.click(toggle);
    expect(strip?.getAttribute("aria-hidden")).toBe("true");
    expect(strip?.style.height).toBe("0px");
    expect(screen.getByText("1 episode selected")).toBeTruthy();
    expect(mocks.selection.clear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(mocks.selection.clear).toHaveBeenCalledOnce();
    fireEvent.click(
      screen.getByRole("button", { name: "Show selected episodes" }),
    );
    expect(strip?.getAttribute("aria-hidden")).toBeNull();
  });

  it("offers to undo a clear until a new selection begins", () => {
    mocks.selection.selected = new Map([["full", fullEpisode]]);
    mocks.selection.candidates = new Map([["full", fullEpisode]]);
    const view = render(<SelectionTray />);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(mocks.selection.clear).toHaveBeenCalledOnce();
    mocks.selection.selected = new Map();
    view.rerender(<SelectionTray />);
    expect(screen.getByRole("status").textContent).toContain(
      "Cleared 1 episode",
    );
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(mocks.selection.capture).toHaveBeenCalledWith(fullEpisode);
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("resizes the strip by rows from the keyboard within the pane bounds", () => {
    mocks.selection.selected = new Map([["full", fullEpisode]]);
    render(<SelectionTray />);
    const handle = screen.getByRole("separator");
    const initial = Number(handle.getAttribute("aria-valuenow"));
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    const grown = Number(handle.getAttribute("aria-valuenow"));
    expect(grown).toBeGreaterThanOrEqual(initial);
    expect(grown).toBeLessThanOrEqual(
      Number(handle.getAttribute("aria-valuemax")),
    );
    fireEvent.keyDown(handle, { key: "Home" });
    expect(Number(handle.getAttribute("aria-valuenow"))).toBe(initial);
  });

  it("keeps overflow actions mounted and reveals their rows in the more panel", async () => {
    const run = vi.fn();
    const Component = ({ surface }: GridSelectionActionProps) => (
      <ActionEntry
        label="Export"
        icon={TagIcon}
        surface={surface}
        disabledReason={null}
        onClick={run}
      />
    );
    const action: GridSelectionAction = {
      id: "test:export",
      order: 50,
      label: "Export",
      placement: "more",
      supports: () => true,
      scope: "explicit-or-results",
      memberKinds: ["episode", "segment"],
      Component,
    };
    let dispose = () => undefined as void;
    act(() => {
      dispose = registerGridSelectionAction(action);
    });
    mocks.selection.counts = countSelection([fullEpisode]);
    render(<SelectionTray />);
    expect(screen.queryByRole("menuitem")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const row = await screen.findByRole("menuitem", { name: "Export" });
    fireEvent.click(row);
    expect(run).toHaveBeenCalledOnce();
    act(() => dispose());
  });
});
