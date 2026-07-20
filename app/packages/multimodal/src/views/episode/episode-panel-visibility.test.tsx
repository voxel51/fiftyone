import { TileIdScope, TilingProvider } from "@fiftyone/tiling";
import { act, cleanup, renderHook } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  EpisodePanelVisibilityProvider,
  readEpisode3dTileVisibility,
  useEpisodeImageTileLabelStreams,
  useEpisodeImageTilePointCloudProjection,
  writeEpisode3dTileVisibility,
} from "./episode-panel-visibility";
import { DEFAULT_EPISODE_PROJECTION_POINT_SIZE } from "./episode-point-size";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("episode panel visibility persistence", () => {
  it("isolates 3D visibility by inspection scope and tile", () => {
    writeEpisode3dTileVisibility("dataset-a:field-a", "3d-1", {
      enabledSourceIds: ["/lidar/top", "/camera/front/camera_info"],
      primarySourceId: "/lidar/top",
    });

    expect(readEpisode3dTileVisibility("dataset-a:field-a", "3d-1")).toEqual({
      enabledSourceIds: ["/lidar/top", "/camera/front/camera_info"],
      primarySourceId: "/lidar/top",
    });
    expect(readEpisode3dTileVisibility("dataset-a:field-a", "3d-2")).toBeNull();
    expect(readEpisode3dTileVisibility("dataset-a:field-b", "3d-1")).toBeNull();
  });

  it("defaults image labels off and restores an explicit per-tile choice", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <EpisodePanelVisibilityProvider scopeKey="dataset-a:field-a">
        <TilingProvider>
          <TileIdScope tileId="image-1">{children}</TileIdScope>
        </TilingProvider>
      </EpisodePanelVisibilityProvider>
    );
    const first = renderHook(
      () => useEpisodeImageTileLabelStreams("/camera/front/image"),
      { wrapper },
    );

    expect(first.result.current.labelStreams).toEqual([]);
    act(() => first.result.current.setLabelStreams(["/camera/front/labels"]));
    expect(first.result.current.labelStreams).toEqual(["/camera/front/labels"]);
    first.unmount();

    const restored = renderHook(
      () => useEpisodeImageTileLabelStreams("/camera/front/image"),
      { wrapper },
    );
    expect(restored.result.current.labelStreams).toEqual([
      "/camera/front/labels",
    ]);
  });

  it("isolates point-cloud projections for image tiles on the same source", () => {
    const wrapperFor = (tileId: string) => {
      const Wrapper = ({ children }: { children: React.ReactNode }) => (
        <EpisodePanelVisibilityProvider scopeKey="dataset-a:field-a">
          <TilingProvider>
            <TileIdScope tileId={tileId}>{children}</TileIdScope>
          </TilingProvider>
        </EpisodePanelVisibilityProvider>
      );
      return Wrapper;
    };
    const foo = renderHook(
      () => useEpisodeImageTilePointCloudProjection("/camera/front/image"),
      { wrapper: wrapperFor("image-1") },
    );
    const bar = renderHook(
      () => useEpisodeImageTilePointCloudProjection("/camera/front/image"),
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
      pointSize: DEFAULT_EPISODE_PROJECTION_POINT_SIZE,
      streams: [],
    });

    foo.unmount();
    const restored = renderHook(
      () => useEpisodeImageTilePointCloudProjection("/camera/front/image"),
      { wrapper: wrapperFor("image-1") },
    );
    expect(restored.result.current.projection).toEqual({
      enabled: true,
      pointSize: 8,
      streams: ["/lidar/top"],
    });
  });

  it("fails closed on malformed storage", () => {
    localStorage.setItem("fiftyone.mcap.panel-visibility", "{not-json");
    expect(readEpisode3dTileVisibility("dataset-a", "3d-1")).toBeNull();
  });

  it("restores the legacy key and projection field names", () => {
    localStorage.setItem(
      "fiftyone.mcap.panel-visibility",
      JSON.stringify({
        version: 1,
        byScope: {
          "dataset-a:field-a": {
            updatedAtMs: 1,
            tiles: {
              "image-1": {
                imageLabelTopics: {
                  "/camera/front": ["/labels/front"],
                },
                imagePointCloudProjections: {
                  "/camera/front": {
                    enabled: true,
                    pointSize: 5,
                    topics: ["/lidar/top"],
                  },
                },
              },
            },
          },
        },
      }),
    );
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <EpisodePanelVisibilityProvider scopeKey="dataset-a:field-a">
        <TilingProvider>
          <TileIdScope tileId="image-1">{children}</TileIdScope>
        </TilingProvider>
      </EpisodePanelVisibilityProvider>
    );

    const labels = renderHook(
      () => useEpisodeImageTileLabelStreams("/camera/front"),
      { wrapper },
    );
    const projection = renderHook(
      () => useEpisodeImageTilePointCloudProjection("/camera/front"),
      { wrapper },
    );
    expect(labels.result.current.labelStreams).toEqual(["/labels/front"]);
    expect(projection.result.current.projection).toEqual({
      enabled: true,
      pointSize: 5,
      streams: ["/lidar/top"],
    });
  });
});
