import { act, cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as voodoMock from "../../__tests__/voodo-mock";

vi.mock("@voxel51/voodo", () => voodoMock);

// eslint-disable-next-line import/first
import { TileIdScope, TilingProvider, useTiling } from "../../lib/TilingProvider";
// eslint-disable-next-line import/first
import { useSetTileSelection } from "../../lib/use-tile-state";
// eslint-disable-next-line import/first
import TilingInspectorSidebar from "./TilingInspectorSidebar";

const Selector: React.FC<{ payload: unknown }> = ({ payload }) => {
  const setSelection = useSetTileSelection();
  return (
    <button data-testid="emit-selection" onClick={() => setSelection(payload)} />
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
      </TilingProvider>
    );
    expect(screen.getByText("Select a tile to inspect.")).toBeTruthy();
  });

  it("renders the focused tile's title and the no-selection hint", () => {
    render(
      <TilingProvider
        initialTiles={{
          "graph-1": { title: "imu", render: () => null },
        }}
      >
        <FocusButton id="graph-1" />
        <TilingInspectorSidebar />
      </TilingProvider>
    );
    act(() => {
      screen.getByTestId("focus-graph-1").click();
    });
    expect(screen.getByText("imu")).toBeTruthy();
    expect(
      screen.getByText(
        /Click something inside the tile.* to inspect its data/i
      )
    ).toBeTruthy();
  });

  it("renders the focused tile's selection payload as JSON", () => {
    const payload = { kind: "graph-sample", timeSec: 1.5, values: { velocity: 0.4 } };
    render(
      <TilingProvider
        initialTiles={{ "graph-1": { title: "imu", render: () => null } }}
      >
        <TileIdScope tileId="graph-1">
          <Selector payload={payload} />
        </TileIdScope>
        <FocusButton id="graph-1" />
        <TilingInspectorSidebar />
      </TilingProvider>
    );
    act(() => {
      screen.getByTestId("focus-graph-1").click();
      screen.getByTestId("emit-selection").click();
    });
    const json = JSON.stringify(payload, null, 2);
    const pre = document.querySelector("pre");
    expect(pre).toBeTruthy();
    expect(pre!.textContent).toBe(json);
  });
});
