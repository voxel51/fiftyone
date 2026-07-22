import { TileIdScope, TilingProvider } from "@fiftyone/tiling";
import { act, cleanup, renderHook } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  PanelVisibilityProvider,
  readScene3dTileVisibility,
  useImageTileLabelStreams,
  useImageTilePointCloudProjection,
  writeScene3dTileVisibility,
} from "./panel-visibility";
import { DEFAULT_PROJECTION_POINT_SIZE } from "../presentation/point-size-policy";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("episode panel visibility persistence", () => {
  it("isolates 3D visibility by inspection scope and tile", () => {
    writeScene3dTileVisibility("dataset-a:field-a", "3d-1", {
      enabledSourceIds: ["/lidar/top", "/camera/front/camera_info"],
      primarySourceId: "/lidar/top",
    });

    expect(readScene3dTileVisibility("dataset-a:field-a", "3d-1")).toEqual({
      enabledSourceIds: ["/lidar/top", "/camera/front/camera_info"],
      primarySourceId: "/lidar/top",
    });
    expect(readScene3dTileVisibility("dataset-a:field-a", "3d-2")).toBeNull();
    expect(readScene3dTileVisibility("dataset-a:field-b", "3d-1")).toBeNull();
  });

  it("defaults image labels off and restores an explicit per-tile choice", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PanelVisibilityProvider scopeKey="dataset-a:field-a">
        <TilingProvider>
          <TileIdScope tileId="image-1">{children}</TileIdScope>
        </TilingProvider>
      </PanelVisibilityProvider>
    );
    const first = renderHook(
      () => useImageTileLabelStreams("/camera/front/image"),
      { wrapper },
    );

    expect(first.result.current.labelStreams).toEqual([]);
    const defaultLabelStreams = first.result.current.labelStreams;
    first.rerender();
    expect(first.result.current.labelStreams).toBe(defaultLabelStreams);
    act(() => first.result.current.setLabelStreams(["/camera/front/labels"]));
    expect(first.result.current.labelStreams).toEqual(["/camera/front/labels"]);
    first.unmount();

    const restored = renderHook(
      () => useImageTileLabelStreams("/camera/front/image"),
      { wrapper },
    );
    expect(restored.result.current.labelStreams).toEqual([
      "/camera/front/labels",
    ]);
  });

  it("isolates point-cloud projections for image tiles on the same source", () => {
    const wrapperFor = (tileId: string) => {
      const Wrapper = ({ children }: { children: React.ReactNode }) => (
        <PanelVisibilityProvider scopeKey="dataset-a:field-a">
          <TilingProvider>
            <TileIdScope tileId={tileId}>{children}</TileIdScope>
          </TilingProvider>
        </PanelVisibilityProvider>
      );
      return Wrapper;
    };
    const foo = renderHook(
      () => useImageTilePointCloudProjection("/camera/front/image"),
      { wrapper: wrapperFor("image-1") },
    );
    const bar = renderHook(
      () => useImageTilePointCloudProjection("/camera/front/image"),
      { wrapper: wrapperFor("image-2") },
    );

    act(() =>
      foo.result.current.setProjection({
        enabled: true,
        pointSize: 8,
        streams: ["/lidar/top"],
      }),
    );

    expect(foo.result.current.projection).toEqual({
      enabled: true,
      pointSize: 8,
      streams: ["/lidar/top"],
    });
    expect(bar.result.current.projection).toEqual({
      enabled: false,
      pointSize: DEFAULT_PROJECTION_POINT_SIZE,
      streams: [],
    });

    foo.unmount();
    const restored = renderHook(
      () => useImageTilePointCloudProjection("/camera/front/image"),
      { wrapper: wrapperFor("image-1") },
    );
    expect(restored.result.current.projection).toEqual({
      enabled: true,
      pointSize: 8,
      streams: ["/lidar/top"],
    });
  });

  it("fails closed on malformed storage", () => {
    localStorage.setItem("fiftyone.episode.panel-visibility.v2", "{not-json");
    expect(readScene3dTileVisibility("dataset-a", "3d-1")).toBeNull();
  });
});
