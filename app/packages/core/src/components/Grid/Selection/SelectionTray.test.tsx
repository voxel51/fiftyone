import {
  registerGridSelectionAction,
  type GridSelectionAction,
  type GridSelectionActionProps,
} from "@fiftyone/multimodal/extensions/grid-selection";
import {
  countSelection,
  subsetRequest,
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
import type { ReactNode } from "react";
import { setHoveredTile } from "../gridTileRegistry";
import ActionEntry from "./ActionEntry";
import { SelectionAssistantFallbackContext } from "./SelectionAssistantFallbackContext";
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
    active: "primary",
    selected: new Map<string, EpisodeSelection>(),
    /** Every section's captures; defaults to the first holding `selected`. */
    get captures(): ReadonlyMap<string, Captures> {
      return state.captures ?? new Map([["primary", selection.selected]]);
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
    request: { view: [], slice: undefined as string | undefined },
    activate: vi.fn(),
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
    modalSampleId: null as string | null,
    searchSimilar: vi.fn(async () => undefined),
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
    sections: {
      split: vi.fn(),
      add: vi.fn(),
      // Up to three sections, made on demand past the existing ones
      sectionAt: vi.fn(
        (index: number) =>
          selection.buckets[index]?.id ?? (index < 3 ? `made-${index}` : null),
      ),
      mergeAll: vi.fn(),
      mergeInto: vi.fn(),
      move: vi.fn(),
      remove: vi.fn(),
    },
    history: {
      undoEnabled: false,
      redoEnabled: false,
      undo: vi.fn(async () => undefined),
      redo: vi.fn(async () => undefined),
      clear: vi.fn(),
    },
    invalidate: vi.fn(),
    boundary: {} as { subsetId?: string },
  };
});

vi.mock("@fiftyone/commands", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fiftyone/commands")>()),
  useUndoRedo: () => mocks.history,
}));
// The recorder is exercised on its own; here the bar reads the stack.
vi.mock("./useTrayHistory", () => ({
  useTrayHistory: vi.fn(),
  trayHistoryScope: () => "scope",
}));

vi.mock("@fiftyone/operators/src/OperatorPlacements", () => ({
  default: ({ fallback }: { fallback?: ReactNode }) => fallback ?? null,
}));
vi.mock("../../Actions/Similarity/utils", () => ({
  useAvailableSimilarityKeys: () => mocks.similarityKeys,
}));
vi.mock("../../Actions/Similarity/useSimilarityPopover", () => ({
  default: (options: { close: () => void }) => {
    mocks.similarity(options);
    return {
      handleSearch: mocks.searchSimilar,
      handleOpenPanel: () => {
        options.close();
        mocks.openSimilarityPanel();
      },
      indexes: (mocks.similarityKeys ?? []).map((key) => ({ key, label: key })),
      resolvedBrainKey: mocks.similarityKeys?.[0],
      setBrainKey: vi.fn(),
      k: 25,
      setK: vi.fn(),
    };
  },
}));

vi.mock("./SubsetJobs", () => ({
  default: () => null,
  SubsetJobStatus: () => null,
}));
vi.mock("@fiftyone/state", async () => ({
  useOutsideClick: (await import("@fiftyone/state/src/hooks/hooks-utils"))
    .useOutsideClick,
  resolveMediaFieldLooker: (
    await import("@fiftyone/state/src/hooks/media-field-lookers")
  ).resolveMediaFieldLooker,
  useSelectedMediaFieldGrid: () => "filepath",
  useLookerOptions: () => ({ mediaFallback: false }),
  getNormalizedUrls: () => ({}),
  useSetGroupSlice: () => vi.fn(),
  useGroupSlices: () => ["left", "right"],
  useGroupField: () => "group",
  useSelectionSubsetDisabledReason: () => null,
  useLoadedSavedViewName: () => null,
  useSavedViewTransientState: () => ({ fieldVisibility: null }),
  useGridViewScope: () => ({ refresh: 0 }),
  useClearGridViewConstraints: () => vi.fn(),
  useSetExpandedSample: () => mocks.setExpandedSample,
  useSetModalState: () => mocks.setModalState,
  useNullableModalSampleId: () => mocks.modalSampleId,
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
    useGridSelectionBoundary: () => [mocks.boundary, vi.fn()],
    useInvalidateSelectionScope: () => mocks.invalidate,
    useSelectionBucketActions: () => mocks.layout,
    useSelectionSections: () => mocks.sections,
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
  mocks.modalSampleId = null;
  mocks.selection.buckets = [{ id: "primary" }];
  mocks.selection.active = "primary";
  mocks.state.captures = null;
  mocks.selection.selected = new Map();
  mocks.selection.request.slice = undefined;
  mocks.selection.mediaType = "video";
  mocks.selection.candidates = new Map();
  mocks.selection.counts = null;
  mocks.selection.loading = false;
  mocks.selection.error = null;
  mocks.boundary = {};
  mocks.selection.clear.mockClear();
  mocks.selection.capture.mockClear();
  mocks.selection.snapshot.mockReset();
  mocks.history.undoEnabled = false;
  mocks.history.redoEnabled = false;
  mocks.invalidate.mockClear();
});
afterEach(() => {
  cleanup();
  setHoveredTile(null);
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const unsure: SelectionBucket = { id: "b2", name: "Unsure", icon: "circle" };

/** The sections of the strip, excluding the tray's own region. */
function sectionCards() {
  return within(
    screen.getByRole("group", { name: "Selection sections" }),
  ).getAllByRole("region");
}

/**
 * Three sections: one whole episode in the first, segments in Unsure, a
 * third empty; the `active` one is what the bar acts on.
 */
function useThreeSections(active = "primary") {
  mocks.selection.buckets = [{ id: "primary" }, unsure, { id: "b3" }];
  mocks.state.captures = new Map<string, Captures>([
    ["primary", new Map([["full", fullEpisode]])],
    ["b2", new Map([["seg", segmentEpisode]])],
    ["b3", new Map()],
  ]);
  mocks.selection.active = active;
  mocks.selection.selected = new Map(mocks.state.captures.get(active));
  mocks.selection.candidates = new Map([
    ["full", fullEpisode],
    ["seg", segmentEpisode],
  ]);
}

describe("SelectionTray", () => {
  it("saves a selected group slice after browsing away from it", async () => {
    mocks.selection.mediaType = "group";
    mocks.selection.request.slice = "right";
    mocks.selection.selected.set("left-sample", {
      episodeId: "left-sample",
      members: [{ episodeId: "left-sample", kind: "episode" }],
      node: {
        id: "left-sample",
        sample: { _id: "left-sample", group: { name: "left" } },
      },
    });
    render(<SelectionTray />);
    fireEvent.click(screen.getByRole("button", { name: "Save as subset" }));
    fireEvent.click(await screen.findByRole("button", { name: "New subset" }));
    fireEvent.change(screen.getByRole("textbox", { name: "New subset name" }), {
      target: { value: "Captured left" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save subset" }));
    await waitFor(() =>
      expect(subsetRequest).toHaveBeenCalledWith(
        "dataset",
        "",
        expect.objectContaining({
          name: "Captured left",
          preferredGroupSlice: "left",
        }),
      ),
    );
  });

  it("lets the host suppress the assistant promotion while placements load", () => {
    const view = render(<SelectionTray />);
    expect(screen.getByRole("button", { name: "Ask agent" })).toBeTruthy();

    view.rerender(
      <SelectionAssistantFallbackContext.Provider value={false}>
        <SelectionTray />
      </SelectionAssistantFallbackContext.Provider>,
    );
    expect(screen.queryByRole("button", { name: "Ask agent" })).toBeNull();
  });

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
    expect(screen.queryByText(/^Act on/)).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Save as subset" })
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
    fireEvent.click(screen.getByRole("button", { name: "Save as subset" }));
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
    expect(screen.getByText("1 episode not in view")).toBeTruthy();
    expect(screen.getByText("Not in view")).toBeTruthy();
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
    expect(screen.queryByText(/not in view/)).toBeNull();
    expect(screen.queryByText("Not in view")).toBeNull();
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
    expect(mocks.selection.clearAll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(mocks.selection.clearAll).toHaveBeenCalledOnce();
    expect(mocks.sections.mergeAll).toHaveBeenCalledOnce();
    fireEvent.click(
      screen.getByRole("button", { name: "Show selected episodes" }),
    );
    expect(strip?.getAttribute("aria-hidden")).toBeNull();
  });

  it("says nothing over all results", () => {
    mocks.selection.counts = countSelection([fullEpisode]);
    render(<SelectionTray />);
    expect(screen.queryByText(/^Act on/)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("offers undo always and redo when available, from the grid's history", () => {
    const view = render(<SelectionTray />);
    const undo = screen.getByRole<HTMLButtonElement>("button", {
      name: "Undo",
    });
    expect(undo.disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Redo" })).toBeNull();
    mocks.history.undoEnabled = true;
    mocks.history.redoEnabled = true;
    view.rerender(<SelectionTray />);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(mocks.history.undo).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(mocks.history.redo).toHaveBeenCalledOnce();
  });

  it("clears one archetype from its own pill", () => {
    mocks.selection.selected = new Map([
      ["full", fullEpisode],
      ["seg", segmentEpisode],
    ]);
    mocks.selection.candidates = new Map([
      ["full", fullEpisode],
      ["seg", segmentEpisode],
    ]);
    render(<SelectionTray />);
    fireEvent.click(
      screen.getByRole("button", { name: "Clear selected segments" }),
    );
    expect(mocks.selection.remove).toHaveBeenCalledWith("seg", "primary");
    expect(mocks.selection.clearAll).not.toHaveBeenCalled();
  });

  it("hands every card the grid locator", async () => {
    mocks.selection.selected = new Map([["full", fullEpisode]]);
    mocks.selection.candidates = new Map([["full", fullEpisode]]);
    const locate = vi.fn(async () => true);
    render(<SelectionTray locate={locate} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Show full.mp4 in grid" }),
    );
    await waitFor(() =>
      expect(locate).toHaveBeenCalledWith("full", expect.any(AbortSignal)),
    );
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

  it("toggles the strip with Ctrl+` and keeps the button in sync", () => {
    mocks.selection.selected = new Map([["full", fullEpisode]]);
    render(<SelectionTray />);
    const toggle = screen.getByRole("button", {
      name: "Hide selected episodes",
    });
    expect(toggle.getAttribute("aria-keyshortcuts")).toBe("Control+`");

    fireEvent.keyDown(document.body, { key: "`" });
    fireEvent.keyDown(document.body, { key: "`", ctrlKey: true, repeat: true });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(document.body, { key: "`", ctrlKey: true });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-label")).toBe("Show selected episodes");
    fireEvent.keyDown(document.body, { key: "`", ctrlKey: true });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(toggle);
    fireEvent.keyDown(document.body, { key: "`", ctrlKey: true });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("leaves the strip expanded while typing or working in a dialog", () => {
    mocks.selection.selected = new Map([["full", fullEpisode]]);
    const view = render(
      <>
        <input aria-label="Search" />
        <SelectionTray />
      </>,
    );
    const toggle = screen.getByRole("button", {
      name: "Hide selected episodes",
    });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Search" }), {
      key: "`",
      ctrlKey: true,
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    view.rerender(
      <>
        <div role="dialog" aria-label="Settings" />
        <SelectionTray />
      </>,
    );
    fireEvent.keyDown(document.body, { key: "`", ctrlKey: true });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
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

  it("keeps Find similar visible while indexes load and when none exist", () => {
    mocks.similarityKeys = null;
    const view = render(<SelectionTray />);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Find similar" })
        .disabled,
    ).toBe(true);
    mocks.similarityKeys = [];
    view.rerender(<SelectionTray />);
    const button = screen.getByRole<HTMLButtonElement>("button", {
      name: "Find similar",
    });
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(mocks.searchSimilar).not.toHaveBeenCalled();
    expect(mocks.openSimilarityPanel).not.toHaveBeenCalled();
  });

  it("disables similarity search when nothing is selected", () => {
    mocks.similarityKeys = ["similarity"];
    mocks.selection.counts = countSelection([fullEpisode]);
    render(<SelectionTray />);
    const button = screen.getByRole<HTMLButtonElement>("button", {
      name: "Find similar",
    });
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(mocks.openSimilarityPanel).not.toHaveBeenCalled();
    expect(mocks.searchSimilar).not.toHaveBeenCalled();
  });

  it("keeps similarity settings and portaled pickers inside the kebab flow", async () => {
    mocks.similarityKeys = ["clip", "resnet"];
    mocks.selection.counts = countSelection([fullEpisode]);
    render(<SelectionTray />);
    expect(
      screen.queryByRole("button", { name: "Find similar settings" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Similarity index" }),
    ).toBeNull();

    const more = screen.getByRole("button", { name: "More actions" });
    fireEvent.click(more);
    const settings = screen.getByRole("group", {
      name: "Find similar settings",
    });
    expect(within(settings).getByRole("separator")).toBeTruthy();
    fireEvent.click(
      within(settings).getByRole("button", { name: "Similarity index" }),
    );
    const index = await screen.findByRole("menuitem", { name: "resnet" });
    fireEvent.pointerDown(index);
    fireEvent.click(index);
    expect(more.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(
      within(settings).getByRole("button", { name: "Number of results" }),
    );
    const count = await screen.findByRole("menuitem", { name: "Top 50" });
    fireEvent.pointerDown(count);
    fireEvent.click(count);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(
      within(settings).getByRole("button", { name: "Open search panel" }),
    );
    expect(mocks.openSimilarityPanel).toHaveBeenCalledOnce();
    expect(more.getAttribute("aria-expanded")).toBe("false");
  });

  it("searches from the active section's samples", () => {
    mocks.similarityKeys = ["similarity"];
    useThreeSections();
    render(<SelectionTray />);
    fireEvent.click(screen.getByRole("button", { name: "Find similar" }));
    expect(mocks.searchSimilar).toHaveBeenCalledOnce();
    expect(mocks.similarity).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: { queryIds: ["full"] } }),
    );
  });

  it("does not search whole samples for a section of segments", () => {
    mocks.similarityKeys = ["similarity"];
    useThreeSections("b2");
    render(<SelectionTray />);
    const button = screen.getByRole<HTMLButtonElement>("button", {
      name: "Find similar",
    });
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(mocks.searchSimilar).not.toHaveBeenCalled();
  });

  it("keeps one strip until split, with one quiet way to split", () => {
    mocks.selection.selected = new Map([["full", fullEpisode]]);
    mocks.selection.candidates = new Map([["full", fullEpisode]]);
    render(<SelectionTray />);
    expect(
      screen.queryByRole("group", { name: "Selection sections" }),
    ).toBeNull();
    expect(screen.getByText("episode selected")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Create splits and select into multiple sections",
      }),
    );
    expect(mocks.sections.split).toHaveBeenCalledOnce();
  });

  it("lays sections side by side with shapes, names, keys, and counts", () => {
    useThreeSections();
    render(<SelectionTray />);
    const sections = sectionCards();
    expect(
      sections.map((section) => section.getAttribute("aria-label")),
    ).toEqual([
      "Section 1, 1 episode, active",
      "Unsure, 2 segments",
      "Section 3, 0 episodes",
    ]);
    expect(sections[0].hasAttribute("data-active")).toBe(true);
    expect(
      sections.map((section) => section.querySelector("kbd")?.textContent),
    ).toEqual(["1", "2", "3"]);
    expect(
      screen.getByRole("button", { name: "Clear 1 from Section 1" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Clear 1 from Unsure" }),
    ).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    // one pill counts every section
    const pills = Array.from(document.querySelectorAll("[data-kind]"));
    expect(pills.map((pill) => pill.textContent)).toEqual(["2total selected"]);
  });

  it("makes a pressed section active, and acts on the active one", async () => {
    useThreeSections("b2");
    render(<SelectionTray />);
    const [first, second] = sectionCards();
    fireEvent.click(first);
    expect(mocks.selection.activate).toHaveBeenLastCalledWith("primary");
    // the name is the section's button, for the keyboard too
    fireEvent.click(within(second).getByRole("button", { name: "Unsure" }));
    expect(mocks.selection.activate).toHaveBeenLastCalledWith("b2");
    // a card's own controls never press its section
    fireEvent.click(screen.getByRole("button", { name: "Open full.mp4" }));
    expect(mocks.selection.activate).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Save as subset" }));
    expect(mocks.selection.snapshot).not.toHaveBeenCalled();
    await screen.findByText(/in Unsure to subset$/);
  });

  it("sorts the sample under the pointer with number keys", () => {
    useThreeSections();
    render(<SelectionTray />);
    // nothing under the pointer: a number does nothing
    fireEvent.keyDown(window, { key: "2" });
    expect(mocks.selection.toggle).not.toHaveBeenCalled();

    act(() => setHoveredTile("tile"));
    fireEvent.keyDown(window, { key: "2" });
    expect(mocks.selection.toggle).toHaveBeenLastCalledWith("tile", "b2");
    // a number past the last section, Shift, or typing does nothing
    fireEvent.keyDown(window, { key: "4" });
    fireEvent.keyDown(window, { key: "@", shiftKey: true });
    const field = document.createElement("input");
    document.body.append(field);
    fireEvent.keyDown(field, { key: "1" });
    field.remove();
    expect(mocks.selection.toggle).toHaveBeenCalledTimes(1);
    act(() => setHoveredTile(null));

    // a tray card sorts like its tile
    fireEvent.pointerOver(
      screen.getByRole("button", { name: "Open full.mp4" }),
    );
    fireEvent.keyDown(window, { key: "3" });
    expect(mocks.selection.toggle).toHaveBeenLastCalledWith("full", "b3");
  });

  it.each(["button", "checkbox"])(
    "sorts a hovered tile while a %s has focus and stops bubbling keys",
    (kind) => {
      useThreeSections();
      render(
        <>
          <input
            type={kind}
            aria-label="Grid control"
            onKeyDown={(event) => event.stopPropagation()}
          />
          <SelectionTray />
        </>,
      );
      const control = screen.getByLabelText("Grid control");
      control.focus();
      act(() => setHoveredTile("tile"));
      for (const [key, bucket] of [
        ["1", "primary"],
        ["2", "b2"],
        ["3", "b3"],
      ]) {
        expect(fireEvent.keyDown(control, { key })).toBe(false);
        expect(mocks.selection.toggle).toHaveBeenLastCalledWith("tile", bucket);
      }
      expect(mocks.selection.toggle).toHaveBeenCalledTimes(3);
      expect(document.activeElement).toBe(control);
      fireEvent.keyDown(control, { key: "3", repeat: true });
      fireEvent.keyDown(control, { key: "3", isComposing: true });
      expect(mocks.selection.toggle).toHaveBeenCalledTimes(3);
    },
  );

  it("leaves hovered samples alone while typing or a modal is open", () => {
    useThreeSections();
    const view = render(
      <>
        <textarea aria-label="Notes" />
        <SelectionTray />
      </>,
    );
    act(() => setHoveredTile("tile"));
    const notes = screen.getByRole("textbox", { name: "Notes" });
    notes.focus();
    expect(fireEvent.keyDown(notes, { key: "1" })).toBe(true);
    expect(mocks.selection.toggle).not.toHaveBeenCalled();

    mocks.modalSampleId = "modal";
    view.rerender(<SelectionTray />);
    fireEvent.keyDown(document.body, { key: "2" });
    expect(mocks.selection.toggle).not.toHaveBeenCalled();

    mocks.modalSampleId = null;
    view.rerender(
      <>
        <div role="dialog" />
        <SelectionTray />
      </>,
    );
    fireEvent.keyDown(document.body, { key: "3" });
    expect(mocks.selection.toggle).not.toHaveBeenCalled();
  });

  it("moves a card dropped on another section, or copies it with Alt", () => {
    useThreeSections();
    render(<SelectionTray />);
    const [first, , third] = sectionCards();
    const card = within(first).getByRole("article");
    // jsdom has no drag events or DataTransfer: drags here are mouse events
    // carrying a minimal one, so a drop reads Alt as a browser's would
    vi.stubGlobal("DragEvent", class extends MouseEvent {});
    const data = new Map<string, string>();
    const dataTransfer = {
      get types() {
        return [...data.keys()];
      },
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) ?? "",
      effectAllowed: "",
      dropEffect: "",
    };
    expect(card.getAttribute("draggable")).toBe("true");
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(third, { dataTransfer });
    expect(third.hasAttribute("data-dropping")).toBe(true);
    fireEvent.drop(third, { dataTransfer });
    expect(third.hasAttribute("data-dropping")).toBe(false);
    expect(mocks.sections.move).toHaveBeenLastCalledWith(
      "full",
      "primary",
      "b3",
      false,
    );
    fireEvent.drop(third, { dataTransfer, altKey: true });
    expect(mocks.sections.move).toHaveBeenLastCalledWith(
      "full",
      "primary",
      "b3",
      true,
    );
    // back where it came from, nothing moves
    fireEvent.drop(first, { dataTransfer });
    expect(mocks.sections.move).toHaveBeenCalledTimes(2);
  });

  it("makes the section a number key names when it does not exist yet", () => {
    render(<SelectionTray />);
    act(() => setHoveredTile("tile"));
    fireEvent.keyDown(window, { key: "3" });
    act(() => setHoveredTile(null));
    expect(mocks.sections.sectionAt).toHaveBeenLastCalledWith(2);
    expect(mocks.selection.toggle).toHaveBeenLastCalledWith("tile", "made-2");
  });

  it("adds a third section while two exist, and no fourth", () => {
    mocks.selection.buckets = [{ id: "primary" }, unsure];
    mocks.state.captures = new Map<string, Captures>([
      ["primary", new Map([["full", fullEpisode]])],
      ["b2", new Map()],
    ]);
    mocks.selection.selected = mocks.state.captures.get("primary") ?? new Map();
    const view = render(<SelectionTray />);
    fireEvent.click(screen.getByRole("button", { name: "Add section" }));
    expect(mocks.sections.add).toHaveBeenCalledOnce();
    useThreeSections();
    view.rerender(<SelectionTray />);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Add section" })
        .disabled,
    ).toBe(true);
  });

  it("clears one section from its count, leaving the others", () => {
    useThreeSections();
    render(<SelectionTray />);
    fireEvent.click(
      screen.getByRole("button", { name: "Clear 1 from Unsure" }),
    );
    expect(mocks.selection.clear).toHaveBeenCalledWith("b2");
    expect(mocks.selection.clearAll).not.toHaveBeenCalled();
  });

  it("merges a section back or forward into its neighbors, or removes it", async () => {
    useThreeSections();
    render(<SelectionTray />);
    const menu = async (title: string) => {
      fireEvent.click(screen.getByRole("button", { name: `${title} options` }));
      await screen.findByRole("menuitem", { name: "Rename" });
      return screen.getAllByRole("menuitem").map((item) => item.textContent);
    };
    // the first section has nothing before it, the last nothing after it
    expect(await menu("Section 1")).toEqual([
      "Rename",
      "Merge forward",
      "Remove section",
    ]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Merge forward" }));
    expect(mocks.sections.mergeInto).toHaveBeenLastCalledWith("primary", "b2");
    expect(await menu("Unsure")).toEqual([
      "Rename",
      "Merge back",
      "Merge forward",
      "Remove section",
    ]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Merge back" }));
    expect(mocks.sections.mergeInto).toHaveBeenLastCalledWith("b2", "primary");
    expect(await menu("Section 3")).toEqual([
      "Rename",
      "Merge back",
      "Remove section",
    ]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove section" }));
    expect(mocks.sections.remove).toHaveBeenCalledWith("b3");
  });

  it("renames a section in place and picks a shape no other section wears", async () => {
    useThreeSections();
    render(<SelectionTray />);
    fireEvent.doubleClick(screen.getByText("Section 3"));
    const name = screen.getByRole("textbox", { name: "Section name" });
    expect(name.getAttribute("maxlength")).toBe("24");
    fireEvent.change(name, { target: { value: "Maybe" } });
    fireEvent.keyDown(name, { key: "Enter" });
    expect(mocks.layout.update).toHaveBeenCalledWith("b3", { name: "Maybe" });

    fireEvent.click(
      screen.getByRole("button", { name: "Change Section 3 shape" }),
    );
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Star, used by another section",
      }).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Use Thumbs up" }));
    expect(mocks.layout.update).toHaveBeenCalledWith("b3", {
      icon: "thumbsUp",
    });
    // the position's own shape is stored as no pick
    fireEvent.click(screen.getByRole("button", { name: "Use Square" }));
    expect(mocks.layout.update).toHaveBeenLastCalledWith("b3", {
      icon: undefined,
    });
  });

  it("saves a section rename on an outside click and still honors cancel", () => {
    useThreeSections();
    render(<SelectionTray />);
    fireEvent.doubleClick(screen.getByText("Section 3"));
    fireEvent.change(screen.getByRole("textbox", { name: "Section name" }), {
      target: { value: " Keep " },
    });
    fireEvent.mouseDown(screen.getByText("Section 1"));
    expect(mocks.layout.update).toHaveBeenCalledWith("b3", { name: "Keep" });
    expect(screen.queryByRole("textbox", { name: "Section name" })).toBeNull();
    mocks.layout.update.mockClear();
    fireEvent.doubleClick(screen.getByText("Section 3"));
    fireEvent.change(screen.getByRole("textbox", { name: "Section name" }), {
      target: { value: "Discard" },
    });
    const cancel = screen.getByRole("button", { name: "Cancel rename" });
    fireEvent.mouseDown(cancel);
    fireEvent.click(cancel);
    expect(mocks.layout.update).not.toHaveBeenCalled();
  });
});
