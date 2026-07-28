import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  TileIdScope,
  TilingProvider,
  useTiling,
} from "../../lib/TilingProvider";
import { useSetTileSelection } from "../../lib/use-tile-state";
import TilingInspectorSidebar from "./TilingInspectorSidebar";

const Selector: React.FC<{ payload: unknown }> = ({ payload }) => {
  const setSelection = useSetTileSelection();
  return (
    <button
      data-testid="emit-selection"
      onClick={() => setSelection(payload)}
    />
  );
};

const FocusButton: React.FC<{ id: string }> = ({ id }) => {
  const { setFocusedTileId } = useTiling();
  return (
    <button data-testid={`focus-${id}`} onClick={() => setFocusedTileId(id)} />
  );
};

describe("TilingInspectorSidebar", () => {
  afterEach(() => cleanup());

  it("shows the empty-state hint when no tile is focused", () => {
    render(
      <TilingProvider>
        <TilingInspectorSidebar />
      </TilingProvider>,
    );
    expect(screen.getByText("Select a tile to inspect.")).toBeTruthy();
  });

  it("renders the no-selection hint when a tile is focused but has no selection", () => {
    render(
      <TilingProvider
        initialTiles={{
          "graph-1": { title: "imu", render: () => null },
        }}
      >
        <FocusButton id="graph-1" />
        <TilingInspectorSidebar />
      </TilingProvider>,
    );
    act(() => {
      screen.getByTestId("focus-graph-1").click();
    });
    expect(
      screen.getByText(
        /Click something inside the tile.* to inspect its data/i,
      ),
    ).toBeTruthy();
  });

  it("renders the focused tile's selection payload as JSON", () => {
    const payload = {
      kind: "graph-sample",
      timeSec: 1.5,
      values: { velocity: 0.4 },
    };
    render(
      <TilingProvider
        initialTiles={{ "graph-1": { title: "imu", render: () => null } }}
      >
        <TileIdScope tileId="graph-1">
          <Selector payload={payload} />
        </TileIdScope>
        <FocusButton id="graph-1" />
        <TilingInspectorSidebar />
      </TilingProvider>,
    );
    act(() => {
      screen.getByTestId("focus-graph-1").click();
      screen.getByTestId("emit-selection").click();
    });
    const json = JSON.stringify(payload, null, 2);
    // RTL normalizes whitespace by default; match on the multi-line content
    // by tag instead so the pretty-printed indentation is preserved.
    const pre = screen.getByText(
      (_text, node) => node?.tagName === "PRE" && node.textContent === json,
    );
    expect(pre).toBeTruthy();
  });

  it("renders the Annotate tab content when the Annotate tab is clicked", () => {
    render(
      <TilingProvider>
        <TilingInspectorSidebar />
      </TilingProvider>,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Annotate" }));
    expect(
      screen.getByText("Annotation workflows are coming soon."),
    ).toBeTruthy();
  });

  it("falls back to String() when the selection cannot be JSON-serialised", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    render(
      <TilingProvider
        initialTiles={{ "graph-1": { title: "g", render: () => null } }}
      >
        <TileIdScope tileId="graph-1">
          <Selector payload={circular} />
        </TileIdScope>
        <FocusButton id="graph-1" />
        <TilingInspectorSidebar />
      </TilingProvider>,
    );
    act(() => {
      screen.getByTestId("focus-graph-1").click();
      screen.getByTestId("emit-selection").click();
    });
    // JSON.stringify throws on circular refs → formatSelection returns String(value).
    const pre = screen.getByText(
      (_text, node) =>
        node?.tagName === "PRE" && node.textContent === "[object Object]",
    );
    expect(pre).toBeTruthy();
  });
});
