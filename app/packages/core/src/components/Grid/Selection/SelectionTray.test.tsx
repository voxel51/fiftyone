import {
  registerGridSelectionAction,
  type GridSelectionAction,
  type GridSelectionActionProps,
} from "@fiftyone/multimodal/extensions/grid-selection";
import type { EpisodeSelection } from "@fiftyone/state/src/selection";
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
  selection: {
    datasetId: "dataset",
    domainId: "dataset",
    mediaType: "video",
    conversion: null,
    unit: { one: "episode", many: "episodes", temporal: true },
    enabled: true,
    selected: new Map<string, EpisodeSelection>(),
    candidates: new Map<string, EpisodeSelection>(),
    groups: [] as EpisodeSelection[],
    unavailableGroups: [] as EpisodeSelection[],
    loading: false,
    error: null as string | null,
    request: { view: [] },
    capture: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    toggle: vi.fn(),
  },
  invalidate: vi.fn(),
}));

vi.mock("@fiftyone/state", () => ({
  useGridViewScope: () => ({ refresh: 0 }),
  useClearTemporalTagConstraint: () => vi.fn(),
  useSetExpandedSample: () => vi.fn(),
  useSetModalState: () => vi.fn(),
  useRefresh: () => vi.fn(),
  useSelectionTagDisabledReason: () => null,
  useSetView: () => vi.fn(),
  getSampleSrc: (path: string) => path,
}));
vi.mock("@fiftyone/state/src/selection", async () => ({
  ...(await import("@fiftyone/state/src/selection/model")),
  ...(await import("@fiftyone/state/src/selection/hooks")),
  useGridSelection: () => mocks.selection,
  useGridSelectionBoundary: () => [{}, vi.fn()],
  useInvalidateSelectionScope: () => mocks.invalidate,
  getSelectionProviders: vi.fn(async () => ({
    eventFields: ["events"],
    temporalTags: [],
  })),
  resolveSelection: vi.fn(async () => ({ groups: [], counts: {} })),
  subsetRequest: vi.fn(async () => ({ subsets: [] })),
  selectionTagsRequest: vi.fn(async () => ({ tags: [] })),
}));

beforeEach(() => {
  mocks.selection.selected = new Map();
  mocks.selection.candidates = new Map();
  mocks.selection.groups = [];
  mocks.selection.loading = false;
  mocks.selection.error = null;
  mocks.selection.clear.mockClear();
  mocks.invalidate.mockClear();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SelectionTray", () => {
  it("states the all-results scope with accurate units, loading, and retryable errors", async () => {
    mocks.selection.groups = [fullEpisode, segmentEpisode];
    const view = render(<SelectionTray />);
    expect(screen.getByText("All results")).toBeTruthy();
    expect(
      screen.getByText("1 full episode · 2 segments across 1 episode"),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /selected episodes/ }),
    ).toBeNull();

    mocks.selection.loading = true;
    view.rerender(<SelectionTray />);
    expect(screen.getByText("Resolving results")).toBeTruthy();
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

  it("separates card counts from member scope and flags episodes outside the results", () => {
    mocks.selection.selected = new Map([
      ["full", fullEpisode],
      ["seg", segmentEpisode],
    ]);
    mocks.selection.candidates = new Map([["full", fullEpisode]]);
    mocks.selection.groups = [fullEpisode];
    render(<SelectionTray />);
    expect(screen.getByText("2 selected")).toBeTruthy();
    expect(
      screen.getByText("1 full episode · 2 segments across 1 episode"),
    ).toBeTruthy();
    expect(screen.getByText("· 1 episode not in current results")).toBeTruthy();
    expect(screen.getByText("Not in results")).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(2);
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
    expect(screen.getByText("1 selected")).toBeTruthy();
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
    mocks.selection.groups = [fullEpisode];
    render(<SelectionTray />);
    expect(screen.queryByRole("menuitem")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const row = await screen.findByRole("menuitem", { name: "Export" });
    fireEvent.click(row);
    expect(run).toHaveBeenCalledOnce();
    act(() => dispose());
  });
});
