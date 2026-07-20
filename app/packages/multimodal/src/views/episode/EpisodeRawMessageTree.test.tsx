import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawObjectNode } from "../../ir";
import EpisodeRawMessageTree from "./EpisodeRawMessageTree";

const writeText = vi.fn(async (_text: string) => undefined);
const addToPlot = vi.fn();

beforeEach(() => {
  writeText.mockClear();
  addToPlot.mockClear();
  Object.assign(navigator, { clipboard: { writeText } });
});

afterEach(() => {
  cleanup();
});

const ROOT: RawObjectNode = {
  entries: [
    ["speed", { kind: "scalar", value: "3.5", valueType: "number" }],
    [
      "sequence",
      { kind: "scalar", value: "9007199254740993", valueType: "bigint" },
    ],
    ["label", { kind: "scalar", value: "ego", valueType: "string" }],
    ["enabled", { kind: "scalar", value: "true", valueType: "boolean" }],
    ["unlisted", { kind: "scalar", value: "9", valueType: "number" }],
    [
      "pose",
      {
        entries: [
          [
            "position",
            {
              entries: [
                ["x", { kind: "scalar", value: "1", valueType: "number" }],
                [
                  "deep",
                  {
                    entries: [
                      [
                        "y",
                        { kind: "scalar", value: "2", valueType: "number" },
                      ],
                    ],
                    kind: "object",
                  },
                ],
              ],
              kind: "object",
            },
          ],
        ],
        kind: "object",
      },
    ],
    [
      "data",
      {
        items: [{ kind: "scalar", value: "7", valueType: "number" }],
        kind: "array",
        totalLength: 500,
      },
    ],
  ],
  kind: "object",
};

describe("EpisodeRawMessageTree", () => {
  it("renders scalars inline and auto-expands two levels", () => {
    render(<EpisodeRawMessageTree root={ROOT} />);

    expect(screen.getByText("3.5")).toBeTruthy();
    expect(screen.getByText('"ego"')).toBeTruthy();
    // Depth 0 and 1 rows expand automatically, so position's leaves show…
    expect(screen.getByTestId("episode-raw-node-pose.position.x")).toBeTruthy();
    // …but a depth-2 expandable stays collapsed behind its preview.
    expect(
      screen.queryByTestId("episode-raw-node-pose.position.deep.y"),
    ).toBeNull();
    expect(screen.getByText("{…} 1 fields")).toBeTruthy();
  });

  it("expands collapsed nodes on toggle and folds them back", () => {
    render(<EpisodeRawMessageTree root={ROOT} />);

    fireEvent.click(
      screen.getByTestId("episode-raw-toggle-pose.position.deep"),
    );
    expect(
      screen.getByTestId("episode-raw-node-pose.position.deep.y"),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByTestId("episode-raw-toggle-pose.position.deep"),
    );
    expect(
      screen.queryByTestId("episode-raw-node-pose.position.deep.y"),
    ).toBeNull();
  });

  it("marks pruned arrays with the omitted count", () => {
    render(<EpisodeRawMessageTree root={ROOT} />);

    // Auto-expanded array shows its kept items plus the omission row.
    expect(screen.getByTestId("episode-raw-node-data.0")).toBeTruthy();
    expect(screen.getByText(/499 more\s+items omitted/)).toBeTruthy();
  });

  it("copies a subtree as JSON with truncation markers", () => {
    render(<EpisodeRawMessageTree root={ROOT} />);

    fireEvent.click(screen.getByTestId("episode-raw-copy-data"));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(JSON.parse(writeText.mock.calls[0][0])).toEqual([
      7,
      "… 499 more items",
    ]);
    expect(screen.getByTestId("episode-raw-copy-data").textContent).toBe(
      "copied",
    );
  });

  it("shows add-to-plot actions only for plottable scalar numeric leaves", () => {
    render(
      <EpisodeRawMessageTree
        onAddNumericFieldToPlot={addToPlot}
        plottableFieldPaths={
          new Set(["speed", "sequence", "enabled", "pose.position.x", "data.0"])
        }
        root={ROOT}
      />,
    );

    expect(screen.getByTestId("episode-raw-plot-speed")).toBeTruthy();
    expect(screen.getByTestId("episode-raw-plot-sequence")).toBeTruthy();
    expect(screen.getByTestId("episode-raw-plot-pose.position.x")).toBeTruthy();
    expect(screen.queryByTestId("episode-raw-plot-label")).toBeNull();
    expect(screen.queryByTestId("episode-raw-plot-enabled")).toBeNull();
    expect(screen.queryByTestId("episode-raw-plot-unlisted")).toBeNull();
    expect(screen.getByTestId("episode-raw-plot-data.0")).toBeTruthy();
  });

  it("hides add-to-plot actions when no handler is available", () => {
    render(
      <EpisodeRawMessageTree
        plottableFieldPaths={new Set(["speed"])}
        root={ROOT}
      />,
    );

    expect(screen.queryByTestId("episode-raw-plot-speed")).toBeNull();
  });

  it("emits the dotted field path when a plottable row is added", () => {
    render(
      <EpisodeRawMessageTree
        onAddNumericFieldToPlot={addToPlot}
        plottableFieldPaths={new Set(["pose.position.x"])}
        root={ROOT}
      />,
    );

    fireEvent.click(screen.getByTestId("episode-raw-plot-pose.position.x"));

    expect(addToPlot).toHaveBeenCalledTimes(1);
    expect(addToPlot).toHaveBeenCalledWith("pose.position.x");
    expect(
      screen.getByTestId("episode-raw-plot-pose.position.x").textContent,
    ).toBe("plotted");
  });

  it("emits an indexed dotted path for numeric array elements", () => {
    render(
      <EpisodeRawMessageTree
        onAddNumericFieldToPlot={addToPlot}
        plottableFieldPaths={new Set(["data.0"])}
        root={ROOT}
      />,
    );

    fireEvent.click(screen.getByTestId("episode-raw-plot-data.0"));

    expect(addToPlot).toHaveBeenCalledWith("data.0");
  });
});
