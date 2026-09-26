import {
  registerGridSelectionAction,
  type GridSelectionAction,
  type GridSelectionActionProps,
} from "@fiftyone/multimodal/extensions/grid-selection";
import {
  countSelection,
  type EpisodeSelection,
  type SelectionBucket,
  type SelectionCounts,
} from "@fiftyone/state/src/selection";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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

type Captures = Map<string, EpisodeSelection>;
const mocks = vi.hoisted(() => {
  const state = {
    captures: null as Map<string, Captures> | null,
  };
  const selection = {
    datasetId: "dataset",
    domainId: "dataset",
    mediaType: "video",
    conversion: null,
    unit: { one: "episode", many: "episodes", temporal: true },
    enabled: true,
    buckets: [{ id: "primary" }] as SelectionBucket[],
    target: "primary",
    selected: new Map<string, EpisodeSelection>(),
    /** Every bucket's captures; defaults to the target holding `selected`. */
    get captures(): ReadonlyMap<string, Captures> {
      return (
        state.captures ?? new Map([[selection.target, selection.selected]])
      );
    },
    get membership(): ReadonlyMap<string, readonly string[]> {
      const membership = new Map<string, string[]>();
      for (const [bucketId, captures] of selection.captures)
        for (const id of captures.keys())
          membership.set(id, [...(membership.get(id) ?? []), bucketId]);
      return membership;
    },
    candidates: new Map<string, EpisodeSelection | null>(),
    counts: null as SelectionCounts | null,
    unavailableGroups: [] as EpisodeSelection[],
    loading: false,
    error: null as string | null,
    request: { view: [] },
    setTarget: vi.fn(),
    route: vi.fn(() => ({ id: "primary" })),
    capture: vi.fn(),
    remove: vi.fn(),
    removeEverywhere: vi.fn(),
    clear: vi.fn(),
    clearAll: vi.fn(),
    toggle: vi.fn(),
    select: vi.fn(),
    snapshot: vi.fn(),
  };
  return {
    similarityKeys: [] as string[] | null,
    similarity: vi.fn(),
    searchSimilar: vi.fn(),
    openSimilarityPanel: vi.fn(),
    setExpandedSample: vi.fn(async () => undefined),
    setModalState: vi.fn(async () => undefined),
    selection,
    state,
    layout: {
      add: vi.fn(() => "b-new" as string | null),
      update: vi.fn(),
      remove: vi.fn(),
      restore: vi.fn(),
    },
    removeBucket: vi.fn(),
    invalidate: vi.fn(),
  };
});

vi.mock("@fiftyone/operators/src/OperatorPlacements", () => ({
  default: () => null,
}));
vi.mock("../../Actions/Similarity/utils", () => ({
  useAvailableSimilarityKeys: () => mocks.similarityKeys,
}));
vi.mock("../../Actions/Similarity/useSimilarityPopover", () => ({
  default: (options: unknown) => {
    mocks.similarity(options);
    return {
      handleSearch: mocks.searchSimilar,
      handleOpenPanel: mocks.openSimilarityPanel,
    };
  },
}));

vi.mock("./SubsetJobs", () => ({
  default: () => null,
  SubsetJobStatus: () => null,
}));
vi.mock("@fiftyone/state", () => ({
  useSetGroupSlice: () => vi.fn(),
  useGroupSlices: () => ["left", "right"],
  useSelectionSubsetDisabledReason: () => null,
  useGridViewScope: () => ({ refresh: 0 }),
  useClearTemporalTagConstraint: () => vi.fn(),
  useSetExpandedSample: () => mocks.setExpandedSample,
  useSetModalState: () => mocks.setModalState,
  useRefresh: () => vi.fn(),
  useSelectionTagDisabledReason: () => null,
  useSetView: () => vi.fn(),
  getSampleSrc: (path: string) => path,
}));
vi.mock("@fiftyone/state/src/selection", async () => {
  const awaitedModel = await import("@fiftyone/state/src/selection/model");
  return {
    useSubsetJobs: () => ({ jobs: [], start: vi.fn() }),
    ...(await import("@fiftyone/state/src/selection/model")),
    ...(await import("@fiftyone/state/src/selection/hooks")),
    ...(await import("@fiftyone/state/src/selection/fold")),
    useGridSelection: () => ({
      ...mocks.selection,
      selectedCounts: awaitedModel.countSelection([
        ...mocks.selection.selected.values(),
      ]),
      countsForBucket: (id: string) =>
        awaitedModel.countSelection([
          ...(mocks.selection.captures.get(id)?.values() ?? []),
        ]),
      resolveCaptured: async () => ({
        kind: "members",
        members: [...mocks.selection.selected.values()].flatMap(
          (group) => group.members,
        ),
      }),
      capturedError: null,
    }),
    useGridSelectionDataset: () => mocks.selection,
    useGridSelectionBoundary: () => [{}, vi.fn()],
    useInvalidateSelectionScope: () => mocks.invalidate,
    useSelectionBucketActions: () => mocks.layout,
    useRemoveSelectionBucket: () => mocks.removeBucket,
    getSelectionProviders: vi.fn(async () => ({
      eventFields: ["events"],
      temporalTags: [],
    })),
    resolveSelection: vi.fn(async () => ({ groups: [], counts: {} })),
    createSelectionSnapshot: vi.fn(),
    subsetRequest: vi.fn(async () => ({ subsets: [] })),
    listSubsets: vi.fn(async () => ({ subsets: [], total: 0, count: 0 })),
    getSubset: vi.fn(async () => null),
    selectionTagsRequest: vi.fn(async () => ({ tags: [] })),
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

beforeEach(() => {
  mocks.similarityKeys = [];
  mocks.selection.buckets = [{ id: "primary" }];
  mocks.selection.target = "primary";
  mocks.state.captures = null;
  mocks.selection.selected = new Map();
  mocks.selection.candidates = new Map();
  mocks.selection.counts = null;
  mocks.selection.loading = false;
  mocks.selection.error = null;
  mocks.selection.clear.mockClear();
  mocks.selection.capture.mockClear();
  mocks.selection.snapshot.mockReset();
  mocks.selection.setTarget.mockClear();
  mocks.layout.add.mockClear();
  mocks.layout.update.mockClear();
  mocks.layout.restore.mockClear();
  mocks.removeBucket.mockClear();
  mocks.invalidate.mockClear();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const unsure: SelectionBucket = { id: "b2", name: "Unsure", icon: "question" };

/** The bucket columns of the strip, excluding the tray's own region. */
function bucketColumns() {
  return within(
    screen.getByRole("group", { name: "Selection buckets" }),
  ).getAllByRole("region");
}

/** Three buckets: one whole episode in the first, segments in Unsure, a third empty. */
function useThreeBuckets(target = "primary") {
  mocks.selection.buckets = [{ id: "primary" }, unsure, { id: "b3" }];
  mocks.state.captures = new Map<string, Captures>([
    ["primary", new Map([["full", fullEpisode]])],
    ["b2", new Map([["seg", segmentEpisode]])],
    ["b3", new Map()],
  ]);
  mocks.selection.target = target;
  mocks.selection.selected = mocks.state.captures.get(target) ?? new Map();
  mocks.selection.candidates = new Map([
    ["full", fullEpisode],
    ["seg", segmentEpisode],
  ]);
}

describe("SelectionTray", () => {
  it("states the all-results scope from exact counts, with loading and retryable errors", async () => {
    mocks.selection.counts = countSelection([fullEpisode, segmentEpisode]);
    const view = render(<SelectionTray />);
    expect(
      screen.getByText("Act on 1 full episode · 2 segments across 1 episode"),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Clear/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /selected episodes/ }),
    ).toBeNull();

    mocks.selection.loading = true;
    mocks.selection.counts = null;
    view.rerender(<SelectionTray />);
    expect(screen.getByText("Loading current results…")).toBeTruthy();
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
    const pills = Array.from(document.querySelectorAll("[data-kind]"));
    expect(pills.map((pill) => pill.textContent)).toEqual([
      "1episode selected",
      "2segments selected",
    ]);
    expect(screen.getByText("1 episode not in current results")).toBeTruthy();
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
    expect(screen.getByRole("article", { name: /^e49\.mp4,/ })).toBeTruthy();
    expect(screen.queryByRole("article", { name: /^e50\.mp4,/ })).toBeNull();
    expect(screen.getByRole("article", { name: /^e70\.mp4,/ })).toBeTruthy();
    expect(
      screen.getByText("episodes selected").parentElement?.textContent,
    ).toBe("120episodes selected");
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
    expect(screen.getByText("episode selected")).toBeTruthy();
    expect(mocks.selection.clear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(mocks.selection.clear).toHaveBeenCalledOnce();
    mocks.selection.selected = new Map();
    view.rerender(<SelectionTray />);
    expect(screen.getByRole("status").textContent).toContain(
      "Cleared 1 episode",
    );
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(mocks.selection.capture).toHaveBeenCalledWith(
      fullEpisode,
      "replace",
      "primary",
    );
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("clears one archetype from its own pill and offers to undo just that", () => {
    mocks.selection.selected = new Map([
      ["full", fullEpisode],
      ["seg", segmentEpisode],
    ]);
    mocks.selection.candidates = new Map([
      ["full", fullEpisode],
      ["seg", segmentEpisode],
    ]);
    const view = render(<SelectionTray />);
    fireEvent.click(
      screen.getByRole("button", { name: "Clear selected segments" }),
    );
    expect(mocks.selection.remove).toHaveBeenCalledWith("seg", "primary");
    expect(mocks.selection.clear).not.toHaveBeenCalled();
    mocks.selection.selected = new Map([["full", fullEpisode]]);
    view.rerender(<SelectionTray />);
    expect(screen.getByRole("status").textContent).toContain(
      "Cleared 2 segments across 1 episode",
    );
    expect(
      screen.getByRole("button", { name: "Clear selection" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(mocks.selection.capture).toHaveBeenCalledWith(
      segmentEpisode,
      "replace",
      "primary",
    );
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("hands every card the grid locator", async () => {
    mocks.selection.selected = new Map([["full", fullEpisode]]);
    mocks.selection.candidates = new Map([["full", fullEpisode]]);
    const locate = vi.fn(async () => true);
    render(<SelectionTray locate={locate} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Scroll to full.mp4 in the grid" }),
    );
    await waitFor(() => expect(locate).toHaveBeenCalledWith("full"));
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

  it("keeps Find Similar visible while indexes load and when none exist", () => {
    mocks.similarityKeys = null;
    const view = render(<SelectionTray />);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Find Similar" })
        .disabled,
    ).toBe(true);
    mocks.similarityKeys = [];
    view.rerender(<SelectionTray />);
    const button = screen.getByRole<HTMLButtonElement>("button", {
      name: "Find Similar",
    });
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(mocks.searchSimilar).not.toHaveBeenCalled();
    expect(mocks.openSimilarityPanel).not.toHaveBeenCalled();
  });

  it("opens similarity search for the grid when nothing is selected", () => {
    mocks.similarityKeys = ["similarity"];
    mocks.selection.counts = countSelection([fullEpisode]);
    render(<SelectionTray />);
    fireEvent.click(screen.getByRole("button", { name: "Find Similar" }));
    expect(mocks.openSimilarityPanel).toHaveBeenCalledOnce();
    expect(mocks.searchSimilar).not.toHaveBeenCalled();
  });

  it("searches from the target bucket's samples", () => {
    mocks.similarityKeys = ["similarity"];
    useThreeBuckets();
    render(<SelectionTray />);
    fireEvent.click(screen.getByRole("button", { name: "Find Similar" }));
    expect(mocks.searchSimilar).toHaveBeenCalledOnce();
    expect(mocks.similarity).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: { queryIds: ["full"] } }),
    );
  });

  it("does not search whole samples for a bucket of segments", () => {
    mocks.similarityKeys = ["similarity"];
    useThreeBuckets("b2");
    render(<SelectionTray />);
    const button = screen.getByRole<HTMLButtonElement>("button", {
      name: "Find Similar",
    });
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(mocks.searchSimilar).not.toHaveBeenCalled();
  });

  it("keeps the single tray as it was, with one quiet way into buckets", () => {
    mocks.selection.selected = new Map([["full", fullEpisode]]);
    mocks.selection.candidates = new Map([["full", fullEpisode]]);
    render(<SelectionTray />);
    expect(
      screen.queryByRole("group", { name: "Selection buckets" }),
    ).toBeNull();
    expect(document.querySelectorAll("[data-bucket-pill]")).toHaveLength(0);
    expect(screen.getByText("episode selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sort into buckets" }));
    expect(mocks.layout.add).toHaveBeenCalledOnce();
    expect(mocks.selection.setTarget).toHaveBeenCalledWith("b-new");
  });

  it("lays buckets side by side with dividers, gestures, and empty hints", () => {
    useThreeBuckets();
    render(<SelectionTray />);
    const columns = bucketColumns();
    expect(columns.map((column) => column.getAttribute("aria-label"))).toEqual([
      "Bucket 1, 1 episode",
      "Unsure, 2 segments",
      "Bucket 3, 0 episodes",
    ]);
    expect(document.querySelectorAll("[data-column-divider]")).toHaveLength(2);
    expect(screen.getByText("click")).toBeTruthy();
    expect(screen.getByText("Ctrl-click")).toBeTruthy();
    expect(screen.getByText("Alt-click")).toBeTruthy();
    expect(
      screen.getByText("Alt-click tiles to add episodes here"),
    ).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(columns[0].hasAttribute("data-target")).toBe(true);
    // The bar names every populated bucket; the third is empty and absent.
    const pills = Array.from(document.querySelectorAll("[data-bucket-pill]"));
    expect(pills.map((pill) => pill.getAttribute("data-bucket-pill"))).toEqual([
      "primary",
      "b2",
    ]);
    expect(pills[0].hasAttribute("data-target")).toBe(true);
  });

  it("applies actions to the target bucket and names it in the panel", async () => {
    useThreeBuckets("b2");
    render(<SelectionTray />);
    expect(
      document
        .querySelector('[data-bucket-pill="b2"]')
        ?.hasAttribute("data-target"),
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Bucket 1, 1 episode. Apply actions to this bucket.",
      }),
    );
    expect(mocks.selection.setTarget).toHaveBeenCalledWith("primary");
    fireEvent.click(screen.getByRole("button", { name: "Add to subset" }));
    expect(mocks.selection.snapshot).not.toHaveBeenCalled();
    await screen.findByText(/in Unsure to subset$/);
  });

  it("offers a third bucket while two exist", () => {
    mocks.selection.buckets = [{ id: "primary" }, unsure];
    mocks.state.captures = new Map<string, Captures>([
      ["primary", new Map([["full", fullEpisode]])],
      ["b2", new Map()],
    ]);
    mocks.selection.selected = mocks.state.captures.get("primary") ?? new Map();
    render(<SelectionTray />);
    fireEvent.click(screen.getByRole("button", { name: "Add a bucket" }));
    expect(mocks.layout.add).toHaveBeenCalledOnce();
  });

  it("hides the add affordance once three buckets exist", () => {
    useThreeBuckets();
    render(<SelectionTray />);
    expect(screen.queryByRole("button", { name: "Add a bucket" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Sort into buckets" }),
    ).toBeNull();
  });

  it("clears one bucket from its pill, leaving the others, and undoes into it", () => {
    useThreeBuckets();
    const view = render(<SelectionTray />);
    fireEvent.click(screen.getByRole("button", { name: "Clear Unsure" }));
    expect(mocks.selection.clear).toHaveBeenCalledWith("b2");
    expect(mocks.selection.clearAll).not.toHaveBeenCalled();
    expect(mocks.selection.remove).not.toHaveBeenCalled();
    mocks.state.captures?.set("b2", new Map());
    view.rerender(<SelectionTray />);
    expect(screen.getByRole("status").textContent).toContain(
      "Cleared 2 segments across 1 episode from Unsure",
    );
    expect(screen.getAllByRole("article")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(mocks.selection.capture).toHaveBeenCalledWith(
      segmentEpisode,
      "replace",
      "b2",
    );
  });

  it("removes a bucket from its menu and restores layout and captures on undo", async () => {
    useThreeBuckets();
    const view = render(<SelectionTray />);
    fireEvent.click(screen.getByRole("button", { name: "Unsure options" }));
    fireEvent.click(
      await screen.findByRole("menuitem", { name: /^Remove bucket/ }),
    );
    expect(mocks.removeBucket).toHaveBeenCalledWith("b2");
    mocks.selection.buckets = [{ id: "primary" }, { id: "b3" }];
    mocks.state.captures?.delete("b2");
    view.rerender(<SelectionTray />);
    expect(bucketColumns()).toHaveLength(2);
    expect(screen.getByRole("status").textContent).toContain(
      "Cleared 2 segments across 1 episode from Unsure",
    );
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(mocks.layout.restore).toHaveBeenCalledWith(unsure, 1);
    expect(mocks.selection.capture).toHaveBeenCalledWith(
      segmentEpisode,
      "replace",
      "b2",
    );
  });

  it("renames a bucket and picks an icon from its editor", async () => {
    useThreeBuckets();
    render(<SelectionTray />);
    fireEvent.click(screen.getByRole("button", { name: "Bucket 3 options" }));
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Rename or change icon" }),
    );
    const name = await screen.findByRole("textbox", { name: "Bucket name" });
    expect(name.getAttribute("maxlength")).toBe("10");
    fireEvent.change(name, { target: { value: "Maybe" } });
    expect(mocks.layout.update).toHaveBeenCalledWith("b3", { name: "Maybe" });
    fireEvent.click(screen.getByRole("radio", { name: "Approve" }));
    expect(mocks.layout.update).toHaveBeenCalledWith("b3", {
      icon: "approve",
    });
    fireEvent.click(screen.getByRole("radio", { name: "No icon" }));
    expect(mocks.layout.update).toHaveBeenCalledWith("b3", {
      icon: undefined,
    });
  });

  it("shows where a held modifier will send the next click", () => {
    useThreeBuckets();
    render(<SelectionTray />);
    expect(screen.queryByText(/Next click adds to/)).toBeNull();
    fireEvent.keyDown(window, { key: "Alt", altKey: true });
    expect(screen.getByText("Next click adds to Bucket 3")).toBeTruthy();
    expect(
      screen
        .getByRole("region", { name: "Bucket 3, 0 episodes" })
        .hasAttribute("data-armed"),
    ).toBe(true);
    fireEvent.keyDown(window, { key: "Meta", metaKey: true });
    expect(screen.getByText("Next click adds to Unsure")).toBeTruthy();
    fireEvent.blur(window);
    expect(screen.queryByText(/Next click adds to/)).toBeNull();
  });
});
