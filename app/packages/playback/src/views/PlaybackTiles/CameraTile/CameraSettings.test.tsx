import { cleanup, render, screen } from "@testing-library/react";
import { Provider as JotaiProvider, createStore } from "jotai";
import React, { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as voodoMock from "../../../__tests__/voodo-mock";

vi.mock("@voxel51/voodo", () => voodoMock);

// eslint-disable-next-line import/first
import {
  TileIdScope,
  TilingProvider,
  useTileRegistry,
} from "@fiftyone/tiling";
// eslint-disable-next-line import/first
import CameraSettings from "./CameraSettings";

const DummyTile: React.FC = () => null;

const RegisterCameras: React.FC<{
  entries: Array<{ streamId: string; title: string }>;
}> = ({ entries }) => {
  const { registerTile } = useTileRegistry();
  useEffect(() => {
    const disposes = entries.map((e) =>
      registerTile({
        streamId: e.streamId,
        type: "camera",
        typeLabel: "Camera",
        title: e.title,
        icon: "icon",
        Tile: DummyTile,
      })
    );
    return () => {
      for (const d of disposes) d();
    };
  }, [entries, registerTile]);
  return null;
};

describe("CameraSettings", () => {
  afterEach(() => cleanup());

  function renderInProviders(entries: Array<{ streamId: string; title: string }>) {
    const store = createStore();
    return render(
      <JotaiProvider store={store}>
        <TilingProvider>
          <RegisterCameras entries={entries} />
          <TileIdScope tileId="camera-1">
            <CameraSettings />
          </TileIdScope>
        </TilingProvider>
      </JotaiProvider>
    );
  }

  it("renders one option per registered camera source", () => {
    renderInProviders([
      { streamId: "camera_front", title: "Front" },
      { streamId: "camera_back", title: "Back" },
    ]);
    const select = screen.getByTestId("voodo-select") as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toEqual(["Front", "Back"]);
  });

  it("renders the source label and the per-tile checkboxes", () => {
    renderInProviders([{ streamId: "camera_front", title: "Front" }]);
    expect(screen.getByText("Source")).toBeTruthy();
    expect(screen.getByText("Show overlays")).toBeTruthy();
    expect(screen.getByText("Show bounding boxes")).toBeTruthy();
    expect(screen.getByText("Show track ids")).toBeTruthy();
  });
});
