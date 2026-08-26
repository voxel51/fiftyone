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
  StateActionEpisodeProfile,
  StateActionStats,
} from "../../../ports";
import type { StateActionSchemaState } from "./state-action-context";
import {
  readStoredStatsScope,
  stateActionStatsScopeAtom,
} from "./state-action-display";
import StateActionStatisticsSidebar from "./StateActionStatisticsSidebar";

const mocks = vi.hoisted(() => ({
  dataStream: {
    getTimelineIndex: () => ({
      nsToSec: (timeNs: bigint) => Number(timeNs) / 1e9,
      secToNs: (timeSec: number) => BigInt(Math.round(timeSec * 1e9)),
      startTimeNs: 0n,
    }),
    sourceKey: "source-1",
  },
  ensureSchema: vi.fn(),
  hasProvider: true,
  pause: vi.fn(),
  readDimensionStats: vi.fn<() => Promise<StateActionStats | null>>(),
  readEpisodeProfile: vi.fn<() => Promise<StateActionEpisodeProfile | null>>(),
  schema: { schema: null, status: "idle" } as unknown,
  seek: vi.fn(),
}));

vi.mock("@fiftyone/playback/runtime", () => ({
  usePlayback: () => ({ pause: mocks.pause, seek: mocks.seek }),
}));

vi.mock("../playback/data-stream-context", () => ({
  useDataStream: () => mocks.dataStream,
}));

vi.mock("./state-action-context", () => ({
  useHasStateActionProvider: () => mocks.hasProvider,
  useStateActionContext: () => ({
    ensureSchema: mocks.ensureSchema,
    readDimensionStats: mocks.readDimensionStats,
    readEpisodeProfile: mocks.readEpisodeProfile,
    schema: mocks.schema as StateActionSchemaState,
  }),
}));

const SCHEMA: StateActionSchemaState = {
  schema: {
    action: {
      dimensions: [{ index: 0 }, { index: 1 }],
      dtype: "float32",
      featureName: "action",
      shape: [2],
    },
    rowCount: 167,
    state: {
      dimensions: [
        { index: 0, name: "joint_0" },
        { index: 1, name: "gripper" },
      ],
      dtype: "float32",
      featureName: "observation.state",
      shape: [2],
    },
  },
  status: "ready",
};

const PROFILE: StateActionEpisodeProfile = {
  action: {
    max: [null, null],
    mean: [null, null],
    min: [null, null],
    outOfRangeCounts: null,
  },
  rowCount: 167,
  state: {
    max: [
      { frameIndex: 120, timestampNs: 8_000_000_000n, value: 1.9 },
      { frameIndex: 60, timestampNs: 4_000_000_000n, value: 1 },
    ],
    mean: [0.2, 0.4],
    min: [
      { frameIndex: 43, timestampNs: 2_867_000_000n, value: -2.1 },
      { frameIndex: 0, timestampNs: 0n, value: 0 },
    ],
    outOfRangeCounts: [14, null],
  },
  timing: {
    gapCount: 3,
    gaps: [
      {
        beforeFrameIndex: 88,
        durationNs: 410_000_000n,
        timestampNs: 6_100_000_000n,
      },
    ],
    medianIntervalNs: 66_666_667n,
  },
  trackingError: [0.05, null],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasProvider = true;
  mocks.schema = SCHEMA;
  mocks.readDimensionStats.mockResolvedValue(null);
  mocks.readEpisodeProfile.mockResolvedValue(null);
  window.localStorage.clear();
  getDefaultStore().set(stateActionStatsScopeAtom, "both");
});

afterEach(cleanup);

/** Drives the voodo-backed scope select the way a keyboard user would. */
function selectScope(value: string) {
  const select = screen.getByRole("combobox", { name: /Scope/ });
  fireEvent.focus(select);
  fireEvent.change(select, { target: { value } });
  fireEvent.keyDown(select, { key: "Enter" });
}

describe("StateActionStatisticsSidebar", () => {
  it("renders nothing without a provider or before the schema", () => {
    mocks.hasProvider = false;
    const { container, rerender } = render(<StateActionStatisticsSidebar />);
    expect(container.firstChild).toBe(null);

    mocks.hasProvider = true;
    mocks.schema = { schema: null, status: "idle" };
    rerender(<StateActionStatisticsSidebar />);
    expect(container.firstChild).toBe(null);
  });

  it("renders declared statistics with quantile bands and detail titles", async () => {
    mocks.readDimensionStats.mockResolvedValue({
      sampleCount: 53102,
      state: {
        max: [2.677, 1],
        mean: [0.1, 0.5],
        min: [-2.672, 0],
        q01: [-2.4, 0.01],
        q50: [0.08, 0.5],
        q99: [2.5, 0.99],
        std: [0.9, 0.2],
      },
    });
    const { container } = render(<StateActionStatisticsSidebar />);

    // No panel title: the row count leads the caption line itself.
    expect(screen.getByText(/^167 rows this episode/)).toBeDefined();
    await waitFor(() =>
      expect(screen.getByText(/across 53,102 frames/)).toBeDefined(),
    );
    const statePane = screen.getByRole("table", {
      name: "observation.state declared statistics",
    });
    const firstRow = within(statePane)
      .getAllByRole("row")
      .find((row) => within(row).queryByText("joint_0")) as HTMLElement;
    const cells = within(firstRow).getAllByRole("cell");
    expect(cells.map((cell) => cell.textContent)).toEqual([
      "-2.672",
      "0.1",
      "2.677",
    ]);
    // Quantiles and std ride the row's hover detail, not extra columns.
    expect(firstRow.title).toBe("q01 -2.4 · q50 0.08 · q99 2.5 · std 0.9");
    // One distribution strip per dimension with declared stats.
    expect(
      within(statePane).queryAllByRole("row").length,
    ).toBeGreaterThanOrEqual(3);
    expect(container.querySelectorAll('[class*="rangeBar"]').length).toBe(2);
    // The action feature declares no stats: placeholders and no bars.
    const actionPane = screen.getByRole("table", {
      name: "action declared statistics",
    });
    expect(
      within(actionPane)
        .getAllByRole("cell")
        .every((cell) => cell.textContent === "—"),
    ).toBe(true);
  });

  it("says when the source declares no statistics", async () => {
    mocks.readDimensionStats.mockResolvedValue(null);
    render(<StateActionStatisticsSidebar />);
    await waitFor(() =>
      expect(
        screen.getByText(/declares no statistics \(meta\/stats\.json\)/),
      ).toBeDefined(),
    );
  });

  it("reports the recorded cadence and seeks to the largest gap", async () => {
    mocks.readEpisodeProfile.mockResolvedValue(PROFILE);
    render(<StateActionStatisticsSidebar />);

    const line = await screen.findByTestId("episode-timing-line");
    expect(line.textContent).toContain("Recorded cadence 15 Hz");
    expect(line.textContent).toContain("3 irregular gaps");
    fireEvent.click(
      within(line).getByRole("button", { name: "largest 0.41s" }),
    );
    expect(mocks.pause).toHaveBeenCalled();
    expect(mocks.seek).toHaveBeenCalledWith(6.1);
  });

  it("seeks to a dimension's episode extremes and counts declared-range violations", async () => {
    mocks.readDimensionStats.mockResolvedValue({
      state: { max: [2.677, 1], min: [-2.672, 0] },
    });
    mocks.readEpisodeProfile.mockResolvedValue(PROFILE);
    const { container } = render(<StateActionStatisticsSidebar />);

    const minButton = await screen.findByRole("button", {
      name: "Seek to joint_0 episode minimum (frame 43)",
    });
    fireEvent.click(minButton);
    expect(mocks.pause).toHaveBeenCalled();
    expect(mocks.seek).toHaveBeenCalledWith(2.867);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Seek to joint_0 episode maximum (frame 120)",
      }),
    );
    expect(mocks.seek).toHaveBeenLastCalledWith(8);

    // Out-of-range facts render only where declared bounds existed.
    expect(screen.getByText("· 14 outside declared")).toBeDefined();
    expect(screen.getAllByText(/outside declared/).length).toBe(1);
    // The episode strip overlays the declared bar.
    expect(container.querySelectorAll('[class*="rangeEpisode"]').length).toBe(
      2,
    );
  });

  it("scopes the tables to this episode with seekable extreme cells", async () => {
    mocks.readDimensionStats.mockResolvedValue({
      state: { max: [2.677, 1], min: [-2.672, 0] },
    });
    mocks.readEpisodeProfile.mockResolvedValue(PROFILE);
    render(<StateActionStatisticsSidebar />);

    selectScope("episode");
    const statePane = await screen.findByRole("table", {
      name: "observation.state episode statistics",
    });
    // Min and max cells carry this episode's numbers and seek on click.
    const minButton = within(statePane).getByRole("button", {
      name: "Seek to joint_0 episode minimum (frame 43)",
    });
    expect(minButton.textContent).toBe("-2.1");
    fireEvent.click(minButton);
    expect(mocks.seek).toHaveBeenCalledWith(2.867);
    const firstRow = within(statePane)
      .getAllByRole("row")
      .find((row) => within(row).queryByText("joint_0")) as HTMLElement;
    expect(within(firstRow).getByText("0.2")).toBeDefined();
    // The separate per-dimension episode line folds into the table; only
    // the out-of-range fact remains as its own note.
    expect(screen.queryByText("episode")).toBe(null);
    expect(screen.getByText("· 14 outside declared")).toBeDefined();
    // The choice persists for the next session.
    expect(readStoredStatsScope()).toBe("episode");
  });

  it("hides episode-computed facts in dataset scope", async () => {
    mocks.readDimensionStats.mockResolvedValue({
      sampleCount: 53102,
      state: {
        max: [2.677, 1],
        mean: [0.1, 0.5],
        min: [-2.672, 0],
        q01: [-2.4, 0.01],
        q99: [2.5, 0.99],
      },
    });
    mocks.readEpisodeProfile.mockResolvedValue(PROFILE);
    const { container } = render(<StateActionStatisticsSidebar />);

    selectScope("dataset");
    await waitFor(() =>
      expect(screen.getByText(/across 53,102 frames/)).toBeDefined(),
    );
    // Give the profile promise time to land; dataset scope must still not
    // surface any episode-computed fact.
    await waitFor(() => expect(mocks.readEpisodeProfile).toHaveBeenCalled());
    expect(screen.queryByTestId("episode-timing-line")).toBe(null);
    expect(screen.queryByRole("table", { name: "Tracking error" })).toBe(null);
    expect(screen.queryByText(/outside declared/)).toBe(null);
    expect(container.querySelectorAll('[class*="rangeEpisode"]').length).toBe(
      0,
    );
    expect(container.querySelectorAll('[class*="rangeBar"]').length).toBe(2);
    expect(readStoredStatsScope()).toBe("dataset");
  });

  it("tabulates per-dimension tracking error when the profile carries it", async () => {
    mocks.readEpisodeProfile.mockResolvedValue(PROFILE);
    render(<StateActionStatisticsSidebar />);

    const table = await screen.findByRole("table", {
      name: "Tracking error",
    });
    const rows = within(table).getAllByRole("row");
    expect(rows.length).toBe(2);
    expect(within(rows[0]).getByText("joint_0")).toBeDefined();
    expect(within(rows[0]).getByRole("cell").textContent).toBe("0.05");
    // A dimension with no comparable finite pairs shows a placeholder.
    expect(within(rows[1]).getByRole("cell").textContent).toBe("—");
  });
});
