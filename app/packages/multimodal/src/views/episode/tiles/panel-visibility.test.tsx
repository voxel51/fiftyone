import { TileIdScope, TilingProvider } from "@fiftyone/tiling";
import { act, cleanup, renderHook } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  PanelVisibilityProvider,
  readScene3dTileVisibility,
  useImageTile3dLabelProjection,
  useImageTileLabelStreams,
  useImageTilePointCloudProjection,
  writeScene3dTileVisibility,
} from "./panel-visibility";
import { DEFAULT_PROJECTION_POINT_SIZE } from "../presentation/point-size-policy";

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
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

  it("keeps opt-in point-cloud projections isolated in session storage", () => {
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
    expect(sessionStorage.getItem("fiftyone.episode.projections.v1")).toContain(
      "/lidar/top",
    );
    expect(
      localStorage.getItem("fiftyone.episode.panel-visibility.v2"),
    ).toBeNull();

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

    restored.unmount();
    sessionStorage.clear();
    const nextSession = renderHook(
      () => useImageTilePointCloudProjection("/camera/front/image"),
      { wrapper: wrapperFor("image-1") },
    );
    expect(nextSession.result.current.projection).toEqual({
      enabled: false,
      pointSize: DEFAULT_PROJECTION_POINT_SIZE,
      streams: [],
    });
  });

  it("keeps opt-in 3D-label projections in session storage", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PanelVisibilityProvider scopeKey="dataset-a:field-a">
        <TilingProvider>
          <TileIdScope tileId="image-1">{children}</TileIdScope>
        </TilingProvider>
      </PanelVisibilityProvider>
    );
    const first = renderHook(
      () => useImageTile3dLabelProjection("/camera/front/image"),
      { wrapper },
    );

    expect(first.result.current.projection).toEqual({
      enabled: false,
      streams: [],
    });
    act(() =>
      first.result.current.setProjection({
        enabled: true,
        streams: ["/detections_3d"],
      }),
    );
    expect(first.result.current.projection).toEqual({
      enabled: true,
      streams: ["/detections_3d"],
    });
    expect(sessionStorage.getItem("fiftyone.episode.projections.v1")).toContain(
      "/detections_3d",
    );
    expect(
      localStorage.getItem("fiftyone.episode.panel-visibility.v2"),
    ).toBeNull();
    first.unmount();

    const restored = renderHook(
      () => useImageTile3dLabelProjection("/camera/front/image"),
      { wrapper },
    );
    expect(restored.result.current.projection).toEqual({
      enabled: true,
      streams: ["/detections_3d"],
    });
    act(() => restored.result.current.setProjection({ enabled: false }));
    expect(restored.result.current.projection).toEqual({
      enabled: false,
      streams: [],
    });
  });

  it("does not infer projection opt-in from incomplete session data", () => {
    sessionStorage.setItem(
      "fiftyone.episode.projections.v1",
      JSON.stringify({
        byScope: {
          "dataset-a:field-a": {
            tiles: {
              "image-1": {
                image3dLabelProjections: {
                  "/camera/front/image": { streams: null },
                },
              },
            },
            updatedAtMs: 1,
          },
        },
        version: 1,
      }),
    );
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PanelVisibilityProvider scopeKey="dataset-a:field-a">
        <TilingProvider>
          <TileIdScope tileId="image-1">{children}</TileIdScope>
        </TilingProvider>
      </PanelVisibilityProvider>
    );
    const projection = renderHook(
      () => useImageTile3dLabelProjection("/camera/front/image"),
      { wrapper },
    );

    expect(projection.result.current.projection).toEqual({
      enabled: false,
      streams: [],
    });
  });

  it("fails closed on malformed storage", () => {
    localStorage.setItem("fiftyone.episode.panel-visibility.v2", "{not-json");
    expect(readScene3dTileVisibility("dataset-a", "3d-1")).toBeNull();
  });
});
