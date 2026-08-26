import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StateActionStats } from "../../../ports";
import type { StateActionSchemaState } from "./state-action-context";
import StateActionStatisticsSidebar from "./StateActionStatisticsSidebar";

const mocks = vi.hoisted(() => ({
  ensureSchema: vi.fn(),
  hasProvider: true,
  readDimensionStats: vi.fn<() => Promise<StateActionStats | null>>(),
  schema: { schema: null, status: "idle" } as unknown,
}));

vi.mock("./state-action-context", () => ({
  useHasStateActionProvider: () => mocks.hasProvider,
  useStateActionContext: () => ({
    ensureSchema: mocks.ensureSchema,
    readDimensionStats: mocks.readDimensionStats,
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasProvider = true;
  mocks.schema = SCHEMA;
  mocks.readDimensionStats.mockResolvedValue(null);
});

afterEach(cleanup);

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
});
