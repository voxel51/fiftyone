import { TileIdScope, TilingProvider } from "@fiftyone/tiling";
import { act, cleanup, renderHook } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  McapPanelVisibilityProvider,
  readMcap3dTileVisibility,
  useMcapImageTileLabelTopics,
  useMcapImageTilePointCloudProjection,
  writeMcap3dTileVisibility,
} from "./mcap-panel-visibility";
import { DEFAULT_MCAP_PROJECTION_POINT_SIZE } from "./mcap-point-size";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("MCAP panel visibility persistence", () => {
  it("isolates 3D visibility by inspection scope and tile", () => {
    writeMcap3dTileVisibility("dataset-a:field-a", "3d-1", {
      enabledSourceIds: ["/lidar/top", "/camera/front/camera_info"],
      primarySourceId: "/lidar/top",
    });

    expect(readMcap3dTileVisibility("dataset-a:field-a", "3d-1")).toEqual({
      enabledSourceIds: ["/lidar/top", "/camera/front/camera_info"],
      primarySourceId: "/lidar/top",
    });
    expect(readMcap3dTileVisibility("dataset-a:field-a", "3d-2")).toBeNull();
    expect(readMcap3dTileVisibility("dataset-a:field-b", "3d-1")).toBeNull();
  });

  it("defaults image labels off and restores an explicit per-tile choice", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <McapPanelVisibilityProvider scopeKey="dataset-a:field-a">
        <TilingProvider>
          <TileIdScope tileId="image-1">{children}</TileIdScope>
        </TilingProvider>
      </McapPanelVisibilityProvider>
    );
    const first = renderHook(
      () => useMcapImageTileLabelTopics("/camera/front/image"),
      { wrapper },
    );

    expect(first.result.current.labelTopics).toEqual([]);
    act(() => first.result.current.setLabelTopics(["/camera/front/labels"]));
    expect(first.result.current.labelTopics).toEqual(["/camera/front/labels"]);
    first.unmount();

    const restored = renderHook(
      () => useMcapImageTileLabelTopics("/camera/front/image"),
      { wrapper },
    );
    expect(restored.result.current.labelTopics).toEqual([
      "/camera/front/labels",
    ]);
  });

  it("isolates point-cloud projections for image tiles on the same source", () => {
    const wrapperFor = (tileId: string) => {
      const Wrapper = ({ children }: { children: React.ReactNode }) => (
        <McapPanelVisibilityProvider scopeKey="dataset-a:field-a">
          <TilingProvider>
            <TileIdScope tileId={tileId}>{children}</TileIdScope>
          </TilingProvider>
        </McapPanelVisibilityProvider>
      );
      return Wrapper;
    };
    const foo = renderHook(
      () => useMcapImageTilePointCloudProjection("/camera/front/image"),
      { wrapper: wrapperFor("image-1") },
    );
    const bar = renderHook(
      () => useMcapImageTilePointCloudProjection("/camera/front/image"),
      { wrapper: wrapperFor("image-2") },
    );

    act(() =>
      foo.result.current.setProjection({
        enabled: true,
        pointSize: 8,
        topics: ["/lidar/top"],
      }),
    );

    expect(foo.result.current.projection).toEqual({
      enabled: true,
      pointSize: 8,
      topics: ["/lidar/top"],
    });
    expect(bar.result.current.projection).toEqual({
      enabled: false,
      pointSize: DEFAULT_MCAP_PROJECTION_POINT_SIZE,
      topics: [],
    });

    foo.unmount();
    const restored = renderHook(
      () => useMcapImageTilePointCloudProjection("/camera/front/image"),
      { wrapper: wrapperFor("image-1") },
    );
    expect(restored.result.current.projection).toEqual({
      enabled: true,
      pointSize: 8,
      topics: ["/lidar/top"],
    });
  });

  it("fails closed on malformed storage", () => {
    localStorage.setItem("fiftyone.mcap.panel-visibility", "{not-json");
    expect(readMcap3dTileVisibility("dataset-a", "3d-1")).toBeNull();
  });
});
