import { TileIdScope, TilingProvider } from "@fiftyone/tiling";
import { act, cleanup, renderHook } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  vi.restoreAllMocks();
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
    const persistedBeforeUnmount = localStorage.getItem(
      "fiftyone.episode.panel-visibility.v2",
    );
    first.unmount();
    expect(localStorage.getItem("fiftyone.episode.panel-visibility.v2")).toBe(
      persistedBeforeUnmount,
    );

    const restored = renderHook(
      () => useImageTileLabelStreams("/camera/front/image"),
      { wrapper },
    );
    expect(restored.result.current.labelStreams).toEqual([
      "/camera/front/labels",
    ]);
  });

  it("resets and restores hook state across an in-place scope swap", () => {
    const activeScope = { current: "dataset-a:field-a" };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PanelVisibilityProvider scopeKey={activeScope.current}>
        <TilingProvider>
          <TileIdScope tileId="image-1">{children}</TileIdScope>
        </TilingProvider>
      </PanelVisibilityProvider>
    );
    const hook = renderHook(
      () => useImageTileLabelStreams("/camera/front/image"),
      { wrapper },
    );

    act(() => hook.result.current.setLabelStreams(["/labels/a"]));
    activeScope.current = "dataset-b:field-a";
    hook.rerender();
    expect(hook.result.current.labelStreams).toEqual([]);

    act(() => hook.result.current.setLabelStreams(["/labels/b"]));
    activeScope.current = "dataset-a:field-a";
    hook.rerender();
    expect(hook.result.current.labelStreams).toEqual(["/labels/a"]);
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
      interpolate: false,
      streams: [],
    });
    act(() =>
      first.result.current.setProjection({
        enabled: true,
        interpolate: true,
        streams: ["/detections_3d"],
      }),
    );
    expect(first.result.current.projection).toEqual({
      enabled: true,
      interpolate: true,
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
      interpolate: true,
      streams: ["/detections_3d"],
    });
    act(() => restored.result.current.setProjection({ enabled: false }));
    expect(restored.result.current.projection).toEqual({
      enabled: false,
      interpolate: true,
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
      interpolate: false,
      streams: [],
    });
  });

  it("fails closed on malformed storage", () => {
    localStorage.setItem("fiftyone.episode.panel-visibility.v2", "{not-json");
    expect(readScene3dTileVisibility("dataset-a", "3d-1")).toBeNull();
  });

  it("fails closed on malformed projection session storage", () => {
    sessionStorage.setItem("fiftyone.episode.projections.v1", "{not-json");
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PanelVisibilityProvider scopeKey="dataset-a:field-a">
        <TilingProvider>
          <TileIdScope tileId="image-1">{children}</TileIdScope>
        </TilingProvider>
      </PanelVisibilityProvider>
    );
    const projection = renderHook(
      () => useImageTilePointCloudProjection("/camera/front/image"),
      { wrapper },
    );

    expect(projection.result.current.projection).toEqual({
      enabled: false,
      pointSize: DEFAULT_PROJECTION_POINT_SIZE,
      streams: [],
    });
  });

  it("caps scopes by least-recently-updated timestamp", () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now++);
    for (let index = 0; index < 20; index++) {
      writeScene3dTileVisibility(`dataset-${index}`, "3d-1", {
        enabledSourceIds: [`/lidar/${index}`],
        primarySourceId: `/lidar/${index}`,
      });
    }

    now = 5_000;
    writeScene3dTileVisibility("dataset-0", "3d-1", {
      enabledSourceIds: ["/lidar/touched"],
      primarySourceId: "/lidar/touched",
    });
    writeScene3dTileVisibility("dataset-20", "3d-1", {
      enabledSourceIds: ["/lidar/20"],
      primarySourceId: "/lidar/20",
    });

    const raw = JSON.parse(
      localStorage.getItem("fiftyone.episode.panel-visibility.v2") ?? "null",
    );
    expect(Object.keys(raw.byScope)).toHaveLength(20);
    expect(raw.byScope["dataset-0"]).toBeDefined();
    expect(raw.byScope["dataset-1"]).toBeUndefined();
    expect(raw.byScope["dataset-20"]).toBeDefined();
  });
});
