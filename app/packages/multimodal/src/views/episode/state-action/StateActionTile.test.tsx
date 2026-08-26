import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  StateActionRow,
  StateActionSchema,
  StateActionStats,
} from "../../../ports";
import { stateActionValueModeAtom } from "./state-action-display";
import type {
  StateActionRowState,
  StateActionSchemaState,
} from "./state-action-context";
import StateActionTile from "./StateActionTile";

const NS_PER_SECOND = 1_000_000_000n;

const mocks = vi.hoisted(() => ({
  dataStream: {
    getTimelineIndex: () => ({
      nsToSec: (timeNs: bigint) => Number(timeNs) / 1e9,
      secToNs: (timeSec: number) => BigInt(Math.round(timeSec * 1e9)),
      startTimeNs: 0n,
    }),
    sourceKey: "source-1",
  },
  addFieldToPlot: vi.fn(),
  ensureSchema: vi.fn(),
  holdCursorRow: vi.fn(),
  registerTileSettings: vi.fn(),
  isPlaying: false,
  isPlayPending: false,
  pause: vi.fn(),
  playheadSec: 4,
  readDimensionStats: vi.fn<() => Promise<StateActionStats | null>>(),
  readRowAtCursor: vi.fn(),
  readRowIndexWindow: vi.fn(),
  retryRead: vi.fn(),
  rowState: undefined as unknown,
  schema: { schema: null, status: "idle" } as unknown,
  seek: vi.fn(),
  setTileTitle: vi.fn(),
  subscribeRow: vi.fn(() => vi.fn()),
}));

vi.mock("@fiftyone/tiling", () => ({
  useSetTileTitle: () => mocks.setTileTitle,
  useTileId: () => "lerobot:state-action-1",
}));

vi.mock("@fiftyone/playback/runtime", async () => {
  const { createContext } = await import("react");
  return {
    getIsPlaying: () => mocks.isPlaying,
    getIsPlayPending: () => mocks.isPlayPending,
    getPlayhead: () => mocks.playheadSec,
    // Non-null default so the tile's supersede guard is active in tests.
    PlaybackStoreContext: createContext<object>({}),
    useIsPlaying: () => mocks.isPlaying,
    useIsPlayPending: () => mocks.isPlayPending,
    usePlayback: () => ({ pause: mocks.pause, seek: mocks.seek }),
  };
});

vi.mock("../playback/data-stream-context", () => ({
  useDataStream: () => mocks.dataStream,
}));

vi.mock("../plots/use-add-field-to-plot", () => ({
  useAddFieldToPlot: () => mocks.addFieldToPlot,
}));

vi.mock("../tiles/tile-settings-context", () => ({
  useRegisterTileSettings: (tileId: string, registration: unknown) =>
    mocks.registerTileSettings(tileId, registration),
}));

vi.mock("./state-action-context", () => ({
  useStateActionContext: () => ({
    ensureSchema: mocks.ensureSchema,
    holdCursorRow: mocks.holdCursorRow,
    readDimensionStats: mocks.readDimensionStats,
    readRowAtCursor: mocks.readRowAtCursor,
    readRowIndexWindow: mocks.readRowIndexWindow,
    retryRead: mocks.retryRead,
    rowState: mocks.rowState as StateActionRowState | undefined,
    schema: mocks.schema as StateActionSchemaState,
    subscribeRow: mocks.subscribeRow,
  }),
}));

const SCHEMA: StateActionSchema = {
  action: {
    dimensions: [{ index: 0 }, { index: 1 }, { index: 2 }],
    dtype: "float32",
    featureName: "action",
    shape: [3],
  },
  rowCount: 20,
  state: {
    dimensions: [
      { index: 0, name: "shoulder" },
      { index: 1, name: "elbow" },
    ],
    dtype: "float32",
    featureName: "observation.state",
    shape: [2],
  },
};

function row(overrides: Partial<StateActionRow> = {}): StateActionRow {
  return {
    action: [0.5, Number.NaN, 7],
    cursor: "row:4",
    frameIndex: 4,
    state: [1.25, -2],
    task: { index: 1, label: "fold the towel" },
    timestampNs: 4n * NS_PER_SECOND,
    ...overrides,
  };
}

/** Texts of the value column only; marker, delta, and plot cells drop out. */
function valueCellTexts(pane: HTMLElement): (string | null)[] {
  return within(pane)
    .getAllByRole("cell")
    .filter((cell) => !cell.className.includes("dimDelta"))
    .map((cell) => cell.textContent)
    .filter((text) => text !== "");
}

function setState(
  schema: StateActionSchemaState,
  rowState: StateActionRowState | undefined,
) {
  mocks.schema = schema;
  mocks.rowState = rowState;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Implementations set with mockResolvedValue survive clearAllMocks; the
  // exact-read mocks must not leak a previous test's rows into the next.
  mocks.readRowAtCursor.mockReset();
  mocks.readRowIndexWindow.mockReset();
  mocks.isPlaying = false;
  mocks.isPlayPending = false;
  mocks.playheadSec = 4;
  mocks.readDimensionStats.mockResolvedValue(null);
  getDefaultStore().set(stateActionValueModeAtom, "raw");
  setState({ schema: SCHEMA, status: "ready" }, undefined);
});

afterEach(cleanup);

describe("StateActionTile", () => {
  it("titles itself, ensures the schema, and subscribes to the row", () => {
    render(<StateActionTile />);
    expect(mocks.setTileTitle).toHaveBeenCalledWith("State & Action", {
      source: "auto",
    });
    expect(mocks.ensureSchema).toHaveBeenCalled();
    expect(mocks.subscribeRow).toHaveBeenCalledTimes(1);
    expect(mocks.registerTileSettings).toHaveBeenCalledWith(
      "lerobot:state-action-1",
      expect.objectContaining({ content: expect.anything() }),
    );
  });

  it("renders schema-derived names as a skeleton before any value read", () => {
    render(<StateActionTile />);
    const statePane = screen.getByRole("table", {
      name: "Observation state values",
    });
    expect(within(statePane).getByText("shoulder")).toBeDefined();
    expect(within(statePane).getByText("elbow")).toBeDefined();
    const actionPane = screen.getByRole("table", { name: "Action values" });
    expect(within(actionPane).getByText("[0]")).toBeDefined();
    expect(within(actionPane).getByText("[2]")).toBeDefined();
    expect(screen.queryByRole("button", { name: /Copy exact value/ })).toBe(
      null,
    );
  });

  it("renders both panes from the committed row without pairing them", () => {
    setState(
      { schema: SCHEMA, status: "ready" },
      { row: row(), status: "ready", targetNs: 4n * NS_PER_SECOND },
    );
    render(<StateActionTile />);

    expect(screen.getAllByText("Frame 4 of 20").length).toBeGreaterThan(0);

    const statePane = screen.getByRole("table", {
      name: "Observation state values",
    });
    expect(valueCellTexts(statePane)).toEqual(["1.25", "-2"]);
    const actionPane = screen.getByRole("table", { name: "Action values" });
    expect(valueCellTexts(actionPane)).toEqual(["0.5", "NaN", "7"]);
  });

  it("shows the playhead time only when it differs from the row time", () => {
    setState(
      { schema: SCHEMA, status: "ready" },
      { row: row(), status: "ready", targetNs: 4n * NS_PER_SECOND },
    );
    const { rerender } = render(<StateActionTile />);
    expect(screen.queryByText(/playhead/)).toBe(null);

    setState(
      { schema: SCHEMA, status: "ready" },
      { row: row(), status: "ready", targetNs: 4_500_000_000n },
    );
    rerender(<StateActionTile />);
    expect(screen.getByText("playhead t=+4.500s")).toBeDefined();
  });

  it("marks each value's place on its declared dataset range", async () => {
    // dim 0: 1.25 inside [-2, 2] → tick at 81.25%; dim 1: -2 below the
    // declared [0, 1] → clamped to the left edge and tinted out-of-range.
    mocks.readDimensionStats.mockResolvedValue({
      state: {
        max: [2, 1],
        min: [-2, 0],
        q01: [-1.5, 0.1],
        q99: [1.5, 0.9],
      },
    });
    setState(
      { schema: SCHEMA, status: "ready" },
      { row: row(), status: "ready", targetNs: 4n * NS_PER_SECOND },
    );
    const { container } = render(<StateActionTile />);

    await waitFor(() =>
      expect(container.querySelectorAll('[class*="dimTrackTick"]').length).toBe(
        2,
      ),
    );
    const ticks = container.querySelectorAll<HTMLElement>(
      '[class*="dimTrackTick"]',
    );
    expect(ticks[0].style.left).toBe("81.25%");
    expect(ticks[0].className).not.toContain("dimTrackTickOut");
    expect(ticks[1].style.left).toBe("0%");
    expect(ticks[1].className).toContain("dimTrackTickOut");
    // The declared band renders behind the tick; the action pane, with no
    // declared stats, carries no markers at all.
    expect(container.querySelectorAll('[class*="dimTrackBand"]').length).toBe(
      2,
    );
    const actionPane = screen.getByRole("table", { name: "Action values" });
    expect(actionPane.querySelectorAll('[class*="dimTrackTick"]').length).toBe(
      0,
    );
  });

  it("shows each value's change from the previous row", async () => {
    setState(
      { schema: SCHEMA, status: "ready" },
      { row: row(), status: "ready", targetNs: 4n * NS_PER_SECOND },
    );
    mocks.readRowIndexWindow.mockResolvedValue({
      entries: [
        { cursor: "row:3", timestampNs: 3n * NS_PER_SECOND },
        { cursor: "row:4", timestampNs: 4n * NS_PER_SECOND },
      ],
      hasNext: true,
      hasPrevious: true,
      selectedCursor: "row:4",
    });
    mocks.readRowAtCursor.mockResolvedValue(
      row({
        action: [0.25, 1, 7],
        cursor: "row:3",
        frameIndex: 3,
        state: [1, -2.5],
        timestampNs: 3n * NS_PER_SECOND,
      }),
    );
    render(<StateActionTile />);

    // The previous row resolves through the exact index, never through
    // time; state and action dimension 0 both moved by exactly +0.25.
    await waitFor(() => expect(screen.getAllByText("+0.25").length).toBe(2));
    expect(mocks.readRowAtCursor).toHaveBeenCalledWith(
      "row:3",
      expect.anything(),
    );
    expect(screen.getByText("+0.5")).toBeDefined();
    // A NaN pair renders no delta; an unchanged value shows an exact zero.
    const statePane = screen.getByRole("table", {
      name: "Observation state values",
    });
    expect(within(statePane).getByText("+0.25").className).toContain(
      "dimDelta",
    );
    const actionPane = screen.getByRole("table", { name: "Action values" });
    const actionDeltas = within(actionPane)
      .getAllByRole("cell")
      .filter((cell) => cell.className.includes("dimDelta"))
      .map((cell) => cell.textContent);
    expect(actionDeltas).toEqual(["+0.25", "", "0"]);
  });

  it("displays z-scored values while copy keeps the raw exact value", async () => {
    getDefaultStore().set(stateActionValueModeAtom, "zscore");
    mocks.readDimensionStats.mockResolvedValue({
      state: { mean: [1, 0], std: [0.5, 1] },
    });
    setState(
      { schema: SCHEMA, status: "ready" },
      { row: row(), status: "ready", targetNs: 4n * NS_PER_SECOND },
    );
    render(<StateActionTile />);

    const statePane = screen.getByRole("table", {
      name: "Observation state values",
    });
    // (1.25 − 1) / 0.5 and (−2 − 0) / 1, under a mode-labeled column.
    await waitFor(() =>
      expect(valueCellTexts(statePane)).toEqual(["0.5", "-2"]),
    );
    expect(
      within(statePane).getByRole("columnheader", { name: "Z-score" }),
    ).toBeDefined();
    const copyButton = screen.getByRole("button", {
      name: "Copy exact value 1.25",
    });
    expect(copyButton.textContent).toBe("0.5");
    // The action feature has no declared stats: raw values and a raw-shaped
    // fallback keep the pane honest instead of inventing a scale.
    const actionPane = screen.getByRole("table", { name: "Action values" });
    expect(valueCellTexts(actionPane)).toEqual(["0.5", "NaN", "7"]);
  });

  it("names the absent canonical feature when only one pane exists", () => {
    setState(
      {
        schema: { action: SCHEMA.action, rowCount: 20 },
        status: "ready",
      },
      {
        row: row({ state: undefined }),
        status: "ready",
        targetNs: 4n * NS_PER_SECOND,
      },
    );
    render(<StateActionTile />);
    expect(
      screen.getByText("No observation.state feature declared"),
    ).toBeDefined();
    expect(screen.getByRole("table", { name: "Action values" })).toBeDefined();
    // The absent feature is a compact note, not a pane that starves the
    // available values of space.
    expect(
      screen.queryByRole("table", { name: "Observation state values" }),
    ).toBe(null);
  });

  it("shows a feature-scoped error without shifting later values", () => {
    setState(
      { schema: SCHEMA, status: "ready" },
      {
        row: row({
          featureErrors: { state: "'observation.state' row has 3 values" },
          state: [1, 2, 3],
        }),
        status: "ready",
        targetNs: 4n * NS_PER_SECOND,
      },
    );
    render(<StateActionTile />);
    expect(
      screen.getByText("'observation.state' row has 3 values"),
    ).toBeDefined();
    const statePane = screen.getByRole("table", {
      name: "Observation state values",
    });
    const names = within(statePane)
      .getAllByRole("rowheader")
      .map((cell) => cell.textContent);
    expect(names).toEqual(["shoulder", "elbow", "[2]"]);
    expect(valueCellTexts(statePane)).toEqual(["1", "2", "3"]);
  });

  it("marks a dimension missing from the source row explicitly", () => {
    setState(
      { schema: SCHEMA, status: "ready" },
      {
        row: row({
          featureErrors: { state: "'observation.state' row has 1 value" },
          state: [1],
        }),
        status: "ready",
        targetNs: 4n * NS_PER_SECOND,
      },
    );
    render(<StateActionTile />);
    const statePane = screen.getByRole("table", {
      name: "Observation state values",
    });
    expect(valueCellTexts(statePane)).toEqual(["1", "missing"]);
  });

  it("shows the empty state distinctly from loading and errors", () => {
    setState(
      { schema: SCHEMA, status: "ready" },
      { row: null, status: "ready", targetNs: 0n },
    );
    render(<StateActionTile />);
    expect(screen.getByText("No state/action row at this time")).toBeDefined();
  });

  it("offers retry on a blocking read failure", () => {
    setState(
      { schema: SCHEMA, status: "ready" },
      { error: "link starved", status: "error", targetNs: 0n },
    );
    render(<StateActionTile />);
    expect(
      screen.getByText(/Could not read the state\/action row: link starved/),
    ).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.retryRead).toHaveBeenCalledTimes(1);
  });

  it("marks a failed refetch stale while keeping the previous row visible", () => {
    setState(
      { schema: SCHEMA, status: "ready" },
      {
        error: "link starved",
        row: row(),
        status: "error",
        targetNs: 9n * NS_PER_SECOND,
      },
    );
    render(<StateActionTile />);
    expect(screen.getAllByText("Frame 4 of 20").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Could not read/)).toBe(null);
    const badge = screen.getByTestId("episode-state-action-stale");
    expect(badge.textContent).toContain("Refresh failed. Previous shown.");
    expect(badge.title).toContain("link starved");
    fireEvent.click(within(badge).getByRole("button", { name: "Retry" }));
    expect(mocks.retryRead).toHaveBeenCalledTimes(1);
  });

  it("marks a slow refetch pending while keeping the previous row visible", () => {
    setState(
      { schema: SCHEMA, status: "ready" },
      { row: row(), status: "loading", targetNs: 9n * NS_PER_SECOND },
    );
    render(<StateActionTile />);
    expect(screen.getAllByText("Frame 4 of 20").length).toBeGreaterThan(0);
    expect(screen.getByTestId("episode-state-action-stale").textContent).toBe(
      "Loading… Previous shown.",
    );
  });

  it("steps to the adjacent cursor, seeks the playhead, and pins the row", async () => {
    setState(
      { schema: SCHEMA, status: "ready" },
      { row: row(), status: "ready", targetNs: 4n * NS_PER_SECOND },
    );
    const nextRow = row({
      cursor: "row:5",
      frameIndex: 5,
      timestampNs: 5n * NS_PER_SECOND,
    });
    mocks.readRowIndexWindow.mockResolvedValue({
      entries: [
        { cursor: "row:4", timestampNs: 4n * NS_PER_SECOND },
        { cursor: "row:5", timestampNs: 5n * NS_PER_SECOND },
      ],
      hasNext: true,
      hasPrevious: true,
      selectedCursor: "row:4",
    });
    mocks.readRowAtCursor.mockResolvedValue(nextRow);
    render(<StateActionTile />);

    fireEvent.click(screen.getByRole("button", { name: "Next row (frame 5)" }));
    await waitFor(() => expect(mocks.holdCursorRow).toHaveBeenCalled());

    expect(mocks.readRowIndexWindow).toHaveBeenCalledWith({
      after: 1,
      anchorCursor: "row:4",
      before: 0,
    });
    expect(mocks.readRowAtCursor).toHaveBeenCalledWith("row:5");
    expect(mocks.pause).toHaveBeenCalled();
    expect(mocks.seek).toHaveBeenCalledWith(5);
    expect(mocks.holdCursorRow).toHaveBeenCalledWith(
      nextRow,
      5n * NS_PER_SECOND,
    );
  });

  it("disables stepping at the episode boundaries", () => {
    setState(
      { schema: SCHEMA, status: "ready" },
      {
        row: row({ cursor: "row:0", frameIndex: 0, timestampNs: 0n }),
        status: "ready",
        targetNs: 0n,
      },
    );
    const { rerender } = render(<StateActionTile />);
    // Boundary controls stay disabled and never name an impossible frame.
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Previous row" })
        .disabled,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Next row (frame 1)",
      }).disabled,
    ).toBe(false);

    setState(
      { schema: SCHEMA, status: "ready" },
      {
        row: row({ cursor: "row:19", frameIndex: 19 }),
        status: "ready",
        targetNs: 19n * NS_PER_SECOND,
      },
    );
    rerender(<StateActionTile />);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Next row" })
        .disabled,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Previous row (frame 18)",
      }).disabled,
    ).toBe(false);
  });

  it("abandons a stale step when the playhead moves before it commits", async () => {
    setState(
      { schema: SCHEMA, status: "ready" },
      { row: row(), status: "ready", targetNs: 4n * NS_PER_SECOND },
    );
    mocks.readRowIndexWindow.mockResolvedValue({
      entries: [
        { cursor: "row:4", timestampNs: 4n * NS_PER_SECOND },
        { cursor: "row:5", timestampNs: 5n * NS_PER_SECOND },
      ],
      hasNext: true,
      hasPrevious: true,
      selectedCursor: "row:4",
    });
    let resolveRead!: (value: StateActionRow) => void;
    mocks.readRowAtCursor.mockImplementation(
      () =>
        new Promise<StateActionRow>((resolve) => {
          resolveRead = resolve;
        }),
    );
    render(<StateActionTile />);

    fireEvent.click(screen.getByRole("button", { name: "Next row (frame 5)" }));
    await waitFor(() => expect(mocks.readRowAtCursor).toHaveBeenCalled());
    // The user scrubs elsewhere while the exact read is still in flight.
    mocks.playheadSec = 12;
    resolveRead(
      row({ cursor: "row:5", frameIndex: 5, timestampNs: 5n * NS_PER_SECOND }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole<HTMLButtonElement>("button", {
          name: "Next row (frame 5)",
        }).disabled,
      ).toBe(false),
    );

    expect(mocks.pause).not.toHaveBeenCalled();
    expect(mocks.seek).not.toHaveBeenCalled();
    expect(mocks.holdCursorRow).not.toHaveBeenCalled();
  });

  it("steps with the keyboard when the tile is focused", async () => {
    setState(
      { schema: SCHEMA, status: "ready" },
      { row: row(), status: "ready", targetNs: 4n * NS_PER_SECOND },
    );
    mocks.readRowIndexWindow.mockResolvedValue({
      entries: [
        { cursor: "row:3", timestampNs: 3n * NS_PER_SECOND },
        { cursor: "row:4", timestampNs: 4n * NS_PER_SECOND },
      ],
      hasNext: true,
      hasPrevious: true,
      selectedCursor: "row:4",
    });
    mocks.readRowAtCursor.mockResolvedValue(
      row({ cursor: "row:3", frameIndex: 3, timestampNs: 3n * NS_PER_SECOND }),
    );
    render(<StateActionTile />);

    fireEvent.keyDown(
      screen.getByRole("group", { name: "State and action table" }),
      { key: "ArrowLeft" },
    );
    await waitFor(() => expect(mocks.holdCursorRow).toHaveBeenCalled());
    expect(mocks.readRowIndexWindow).toHaveBeenCalledWith({
      after: 0,
      anchorCursor: "row:4",
      before: 1,
    });
    expect(mocks.seek).toHaveBeenCalledWith(3);
  });

  it("offers an on-hover plot affordance for plottable dimensions", () => {
    setState(
      {
        schema: {
          action: SCHEMA.action,
          rowCount: 20,
          state: {
            dimensions: [
              {
                index: 0,
                name: "shoulder",
                numericFieldPath: "observation.state.shoulder",
              },
              { index: 1, name: "elbow" },
            ],
            dtype: "float32",
            featureName: "observation.state",
            numericStreamId: "lerobot:observation.state",
            shape: [2],
          },
        },
        status: "ready",
      },
      { row: row(), status: "ready", targetNs: 4n * NS_PER_SECOND },
    );
    render(<StateActionTile />);

    fireEvent.click(screen.getByRole("button", { name: "Plot shoulder" }));
    expect(mocks.addFieldToPlot).toHaveBeenCalledWith(
      "lerobot:observation.state",
      "observation.state.shoulder",
    );
    // A dimension without a numeric binding offers no affordance.
    expect(screen.queryByRole("button", { name: "Plot elbow" })).toBe(null);
  });

  it("announces committed rows politely only while paused", () => {
    setState(
      { schema: SCHEMA, status: "ready" },
      { row: row(), status: "ready", targetNs: 4n * NS_PER_SECOND },
    );
    const { container, rerender } = render(<StateActionTile />);
    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion?.textContent).toBe("Frame 4 of 20");

    mocks.isPlaying = true;
    rerender(<StateActionTile />);
    expect(liveRegion?.textContent).toBe("");
  });
});
