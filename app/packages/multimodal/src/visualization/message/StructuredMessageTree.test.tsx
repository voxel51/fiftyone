import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawObjectNode } from "../../ir";
import StructuredMessageTree from "./StructuredMessageTree";

const writeText = vi.fn<(text: string) => Promise<void>>((_text: string) =>
  Promise.resolve(),
);
const addToPlot = vi.fn();

beforeEach(() => {
  writeText.mockClear();
  addToPlot.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
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

describe("StructuredMessageTree", () => {
  it("renders scalars inline and auto-expands two levels", () => {
    render(<StructuredMessageTree root={ROOT} />);

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
    render(<StructuredMessageTree root={ROOT} />);

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
    render(<StructuredMessageTree root={ROOT} />);

    // Auto-expanded array shows its kept items plus the omission row.
    expect(screen.getByTestId("episode-raw-node-data.0")).toBeTruthy();
    expect(screen.getByText(/499 more\s+items omitted/)).toBeTruthy();
  });

  it("copies a subtree as JSON with truncation markers", async () => {
    render(<StructuredMessageTree root={ROOT} />);

    fireEvent.click(screen.getByTestId("episode-raw-copy-data"));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(JSON.parse(writeText.mock.calls[0][0])).toEqual([
      7,
      "… 499 more items",
    ]);
    await waitFor(() =>
      expect(screen.getByTestId("episode-raw-copy-data").textContent).toBe(
        "copied",
      ),
    );
    expect(screen.getByRole("button", { name: "data copied" })).toBeTruthy();
  });

  it("does not report copied when clipboard writing rejects", async () => {
    writeText.mockRejectedValueOnce(new Error("permission denied"));
    render(<StructuredMessageTree root={ROOT} />);

    fireEvent.click(screen.getByTestId("episode-raw-copy-data"));

    await waitFor(() =>
      expect(screen.getByTestId("episode-raw-copy-data").textContent).toBe(
        "copy failed",
      ),
    );
    expect(
      screen.getByRole("button", { name: "Copy data failed" }),
    ).toBeTruthy();
  });

  it("ignores an older clipboard completion after a newer copy", async () => {
    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    writeText
      .mockImplementationOnce(
        () => new Promise<void>((resolve) => (resolveFirst = resolve)),
      )
      .mockImplementationOnce(
        () => new Promise<void>((resolve) => (resolveSecond = resolve)),
      );
    render(<StructuredMessageTree root={ROOT} />);

    fireEvent.click(screen.getByTestId("episode-raw-copy-data"));
    fireEvent.click(screen.getByTestId("episode-raw-copy-speed"));
    await act(async () => {
      resolveSecond();
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "speed copied" })).toBeTruthy();

    await act(async () => {
      resolveFirst();
      await Promise.resolve();
    });
    expect(screen.getByTestId("episode-raw-copy-data").textContent).toBe(
      "copy",
    );
    expect(screen.getByRole("button", { name: "speed copied" })).toBeTruthy();
  });

  it("does not report copied when clipboard support is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    render(<StructuredMessageTree root={ROOT} />);

    fireEvent.click(screen.getByTestId("episode-raw-copy-data"));

    await waitFor(() =>
      expect(screen.getByTestId("episode-raw-copy-data").textContent).toBe(
        "copy failed",
      ),
    );
    expect(writeText).not.toHaveBeenCalled();
  });

  it("paginates wide objects instead of materializing every row", () => {
    const wideRoot: RawObjectNode = {
      entries: Array.from({ length: 250 }, (_, index) => [
        `field-${index}`,
        { kind: "scalar", value: String(index), valueType: "number" },
      ]),
      kind: "object",
    };
    render(<StructuredMessageTree root={wideRoot} />);

    expect(screen.getAllByTestId(/^episode-raw-node-field-/)).toHaveLength(100);
    expect(screen.getByText("(150 not rendered)")).toBeTruthy();

    fireEvent.click(screen.getByTestId("episode-raw-show-more-$"));

    expect(screen.getAllByTestId(/^episode-raw-node-field-/)).toHaveLength(200);
    expect(screen.getByText("(50 not rendered)")).toBeTruthy();
  });

  it("keeps root and dotted-key pagination state distinct", () => {
    const nestedEntries: RawObjectNode["entries"] = Array.from(
      { length: 150 },
      (_, index) => [
        `child-${index}`,
        { kind: "scalar", value: String(index), valueType: "number" },
      ],
    );
    const collisionRoot: RawObjectNode = {
      entries: [
        ["$", { entries: nestedEntries, kind: "object" }],
        ...Array.from(
          { length: 150 },
          (_, index) =>
            [
              `root-${index}`,
              { kind: "scalar", value: String(index), valueType: "number" },
            ] as const,
        ),
      ],
      kind: "object",
    };
    render(<StructuredMessageTree root={collisionRoot} />);
    const nestedRows = () =>
      screen.getAllByTestId(/^episode-raw-node-\$\.child-\d+$/);

    expect(nestedRows()).toHaveLength(100);
    fireEvent.click(screen.getByTestId("episode-raw-show-more-$"));
    expect(nestedRows()).toHaveLength(100);

    fireEvent.click(
      screen.getByTestId(
        `episode-raw-show-more-$root/o:${encodeURIComponent("$")}`,
      ),
    );
    expect(nestedRows()).toHaveLength(150);
  });

  it("preserves pagination across refreshed record identities", () => {
    const wideEntries = Array.from(
      { length: 250 },
      (_, index) =>
        [
          `field-${index}`,
          { kind: "scalar", value: String(index), valueType: "number" },
        ] as const,
    );
    const view = render(
      <StructuredMessageTree root={{ entries: wideEntries, kind: "object" }} />,
    );
    fireEvent.click(screen.getByTestId("episode-raw-show-more-$"));

    view.rerender(
      <StructuredMessageTree
        root={{ entries: [...wideEntries], kind: "object" }}
      />,
    );

    expect(screen.getAllByTestId(/^episode-raw-node-field-/)).toHaveLength(200);
  });

  it("skips tree work when a parent rerenders with the same result identity", () => {
    let entryReads = 0;
    const countedRoot: RawObjectNode = {
      get entries() {
        entryReads += 1;
        return ROOT.entries;
      },
      kind: "object",
    };
    const { rerender } = render(<StructuredMessageTree root={countedRoot} />);
    const readsAfterInitialRender = entryReads;

    rerender(<StructuredMessageTree root={countedRoot} />);

    expect(readsAfterInitialRender).toBeGreaterThan(0);
    expect(entryReads).toBe(readsAfterInitialRender);
  });

  it("shows add-to-plot actions for every rendered scalar numeric leaf", () => {
    render(
      <StructuredMessageTree onAddNumericFieldToPlot={addToPlot} root={ROOT} />,
    );

    expect(screen.getByTestId("episode-raw-plot-speed")).toBeTruthy();
    expect(screen.getByTestId("episode-raw-plot-sequence")).toBeTruthy();
    expect(screen.getByTestId("episode-raw-plot-pose.position.x")).toBeTruthy();
    expect(screen.queryByTestId("episode-raw-plot-label")).toBeNull();
    expect(screen.queryByTestId("episode-raw-plot-enabled")).toBeNull();
    expect(screen.getByTestId("episode-raw-plot-unlisted")).toBeTruthy();
    expect(screen.getByTestId("episode-raw-plot-data.0")).toBeTruthy();
  });

  it("hides add-to-plot actions when no handler is available", () => {
    render(<StructuredMessageTree root={ROOT} />);

    expect(screen.queryByTestId("episode-raw-plot-speed")).toBeNull();
  });

  it("emits the dotted field path when a plottable row is added", () => {
    render(
      <StructuredMessageTree onAddNumericFieldToPlot={addToPlot} root={ROOT} />,
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
      <StructuredMessageTree onAddNumericFieldToPlot={addToPlot} root={ROOT} />,
    );

    fireEvent.click(screen.getByTestId("episode-raw-plot-data.0"));

    expect(addToPlot).toHaveBeenCalledWith("data.0");
  });
});
