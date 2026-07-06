import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { McapRawObjectNode } from "../types";
import McapRawMessageTree from "./McapRawMessageTree";

const writeText = vi.fn(async (_text: string) => undefined);

beforeEach(() => {
  writeText.mockClear();
  Object.assign(navigator, { clipboard: { writeText } });
});

afterEach(() => {
  cleanup();
});

const ROOT: McapRawObjectNode = {
  entries: [
    ["speed", { kind: "scalar", value: "3.5", valueType: "number" }],
    ["label", { kind: "scalar", value: "ego", valueType: "string" }],
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

describe("McapRawMessageTree", () => {
  it("renders scalars inline and auto-expands two levels", () => {
    render(<McapRawMessageTree root={ROOT} />);

    expect(screen.getByText("3.5")).toBeTruthy();
    expect(screen.getByText('"ego"')).toBeTruthy();
    // Depth 0 and 1 rows expand automatically, so position's leaves show…
    expect(screen.getByTestId("mcap-raw-node-pose.position.x")).toBeTruthy();
    // …but a depth-2 expandable stays collapsed behind its preview.
    expect(
      screen.queryByTestId("mcap-raw-node-pose.position.deep.y"),
    ).toBeNull();
    expect(screen.getByText("{…} 1 fields")).toBeTruthy();
  });

  it("expands collapsed nodes on toggle and folds them back", () => {
    render(<McapRawMessageTree root={ROOT} />);

    fireEvent.click(screen.getByTestId("mcap-raw-toggle-pose.position.deep"));
    expect(
      screen.getByTestId("mcap-raw-node-pose.position.deep.y"),
    ).toBeTruthy();

    fireEvent.click(screen.getByTestId("mcap-raw-toggle-pose.position.deep"));
    expect(
      screen.queryByTestId("mcap-raw-node-pose.position.deep.y"),
    ).toBeNull();
  });

  it("marks pruned arrays with the omitted count", () => {
    render(<McapRawMessageTree root={ROOT} />);

    // Auto-expanded array shows its kept items plus the omission row.
    expect(screen.getByTestId("mcap-raw-node-data.0")).toBeTruthy();
    expect(screen.getByText(/499 more\s+items omitted/)).toBeTruthy();
  });

  it("copies a subtree as JSON with truncation markers", () => {
    render(<McapRawMessageTree root={ROOT} />);

    fireEvent.click(screen.getByTestId("mcap-raw-copy-data"));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(JSON.parse(writeText.mock.calls[0][0])).toEqual([
      7,
      "… 499 more items",
    ]);
    expect(screen.getByTestId("mcap-raw-copy-data").textContent).toBe("copied");
  });
});
