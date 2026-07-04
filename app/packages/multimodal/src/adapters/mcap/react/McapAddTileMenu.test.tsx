import {
  TileIdScope,
  TilingProvider,
  useTiling,
  type TilingTile,
} from "@fiftyone/tiling";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Button, Dropdown } from "@voxel51/voodo";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The tile bodies drag in the WebGPU renderer stack, which jsdom can't
// load; the menu only stores their render closures, never mounts them.
vi.mock("./McapImageTile", () => ({ default: () => null }));
vi.mock("./Mcap3dTile", () => ({ default: () => null }));
import {
  SceneInventoryProvider,
  type SceneSource,
} from "../../../scene-inventory";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import { usePublishMcapImageTileBinding } from "./mcap-tile-source-bindings";
import McapAddTileMenu from "./McapAddTileMenu";

const CAM_FRONT: SceneSource = {
  id: "/cam_front/image",
  label: "CAM_FRONT",
  recordCount: 100,
  type: MCAP_SOURCE_TYPE.IMAGE,
};
const CAM_BACK: SceneSource = {
  id: "/cam_back/image",
  label: "CAM_BACK",
  recordCount: 50,
  type: MCAP_SOURCE_TYPE.IMAGE,
};
const LIDAR: SceneSource = {
  id: "/lidar_top",
  label: "LIDAR_TOP",
  recordCount: 40,
  type: MCAP_SOURCE_TYPE.POINT_CLOUD,
};

const TilingProbe: React.FC = () => {
  const { focusedTileId, tiles } = useTiling();
  return (
    <span data-testid="tiling-probe">
      {JSON.stringify({
        focusedTileId,
        titles: Object.fromEntries(
          Object.entries(tiles).map(([id, tile]) => [id, tile.title]),
        ),
      })}
    </span>
  );
};

function probeState() {
  return JSON.parse(screen.getByTestId("tiling-probe").textContent ?? "{}") as {
    focusedTileId: string | null;
    titles: Record<string, string>;
  };
}

const BindingPublisher: React.FC<{
  readonly sourceId: string;
  readonly tileId: string;
}> = ({ sourceId, tileId }) => (
  <TileIdScope tileId={tileId}>
    <PublishBinding sourceId={sourceId} />
  </TileIdScope>
);

const PublishBinding: React.FC<{ readonly sourceId: string }> = ({
  sourceId,
}) => {
  usePublishMcapImageTileBinding(sourceId);
  return null;
};

function renderMenu({
  sources,
  initialTiles = {},
  children,
}: {
  readonly sources: readonly SceneSource[];
  readonly initialTiles?: Record<string, TilingTile>;
  readonly children?: React.ReactNode;
}) {
  return render(
    <SceneInventoryProvider sources={sources}>
      <TilingProvider initialTiles={initialTiles}>
        {children}
        <Dropdown
          trigger={<Button data-testid="open-add-tile-menu">open</Button>}
        >
          <McapAddTileMenu />
        </Dropdown>
        <TilingProbe />
      </TilingProvider>
    </SceneInventoryProvider>,
  );
}

function openMenu() {
  fireEvent.click(screen.getByTestId("open-add-tile-menu"));
}

describe("McapAddTileMenu", () => {
  afterEach(() => cleanup());

  it("lists the 3D scene and the image streams ranked densest-first", () => {
    renderMenu({ sources: [CAM_BACK, CAM_FRONT, LIDAR] });
    openMenu();

    expect(screen.getByTestId("mcap-add-tile-3d").textContent).toContain(
      "3D scene",
    );
    expect(screen.getByText("Image streams")).toBeTruthy();
    const front = screen.getByText("CAM_FRONT");
    const back = screen.getByText("CAM_BACK");
    // CAM_FRONT outranks CAM_BACK (higher record count) → listed first.
    expect(
      front.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("hides the 3D entry when the recording has no 3D sources", () => {
    renderMenu({ sources: [CAM_FRONT] });
    openMenu();
    expect(screen.queryByTestId("mcap-add-tile-3d")).toBeNull();
    expect(screen.getByText("CAM_FRONT")).toBeTruthy();
  });

  it("spawns an image tile bound to the chosen stream and focuses it", () => {
    renderMenu({ sources: [CAM_FRONT, CAM_BACK] });
    openMenu();
    fireEvent.click(screen.getByText("CAM_BACK"));

    const { focusedTileId, titles } = probeState();
    expect(titles["image-1"]).toBe("CAM_BACK");
    expect(focusedTileId).toBe("image-1");
  });

  it("focuses the tile already showing a stream instead of duplicating it", () => {
    renderMenu({
      sources: [CAM_FRONT, CAM_BACK],
      children: <BindingPublisher sourceId={CAM_FRONT.id} tileId="image-7" />,
    });
    openMenu();
    fireEvent.click(screen.getByText("CAM_FRONT"));

    const { focusedTileId, titles } = probeState();
    expect(Object.keys(titles)).toEqual([]);
    expect(focusedTileId).toBe("image-7");
  });

  it("spawns the 3D tile once and focuses it afterwards", () => {
    renderMenu({
      sources: [LIDAR],
      initialTiles: { "3d-1": { title: "3D", render: () => null } },
    });
    openMenu();
    fireEvent.click(screen.getByTestId("mcap-add-tile-3d"));

    const { focusedTileId, titles } = probeState();
    expect(Object.keys(titles)).toEqual(["3d-1"]);
    expect(focusedTileId).toBe("3d-1");
  });

  it("adds a 3D tile when none is open", () => {
    renderMenu({ sources: [LIDAR] });
    openMenu();
    fireEvent.click(screen.getByTestId("mcap-add-tile-3d"));

    const { focusedTileId, titles } = probeState();
    expect(titles["3d-1"]).toBe("3D");
    expect(focusedTileId).toBe("3d-1");
  });
});
