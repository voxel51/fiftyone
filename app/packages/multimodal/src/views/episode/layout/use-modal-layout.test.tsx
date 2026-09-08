import { TilingProvider, useTiling } from "@fiftyone/tiling";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { useAtomValue, useStore } from "jotai";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SceneSource } from "../../../scene-inventory";
import {
  BYTE_SOURCE_READ_PROFILE,
  type ByteSourceReadProfile,
} from "../../../ir";
import {
  readCameraPreferences,
  writeCameraPreferences,
  readModalLayout,
  writeModalLayout,
} from "./layout-persistence";
import {
  ModalLayoutPersistence,
  pruneMosaicLayout,
  useModalLayout,
} from "./use-modal-layout";
import { tileTypesFor, getTileDefinition } from "../shell/tile-catalog";
import {
  scene3dTilePlaybackSettingsAtom,
  type Scene3dTilePlaybackSettingsByTile,
} from "../scene/tile/scene-3d-tile-state";
import { cameraScopeKey } from "../scope/camera-scope";
import { updateSidebarPreferences } from "../settings/sidebar-preferences";
import { semanticSourceKey } from "../settings/semantic-source";

// The tile bodies drag in WebGPU/Three at module load, which jsdom can't
// evaluate. Layout restore only needs them to exist as components; the
// stubs expose their assigned source for binding assertions.
vi.mock("../image/ImageTile", () => ({
  default: ({ initialSourceId }: { initialSourceId?: string }) => (
    <div data-testid="image-tile" data-source={initialSourceId} />
  ),
}));
vi.mock("../scene/tile/Scene3dTile", () => ({ default: () => null }));
vi.mock("../map/tile/MapTile", () => ({ default: () => null }));

const SCENE_SOURCES: readonly SceneSource[] = [
  {
    id: "/cam/image_rect_compressed",
    label: "cam",
    sourceName: "/cam/image_rect_compressed",
    type: "image",
  },
  {
    id: "/lidar",
    label: "lidar",
    sourceName: "/lidar",
    type: "point-cloud",
  },
];

// Deterministic capabilities so jsdom's missing navigator signals can't
// sway the resolver's budgets.
const STRONG_CAPABILITIES = {
  cpuCores: 16,
  memoryGb: 16,
  networkDownlinkMbps: null,
  viewportWidth: 2560,
  viewportHeight: 1440,
};

function renderLayoutHook(
  sources: readonly SceneSource[],
  datasetId?: string,
  cameraPreferenceField?: string,
  readProfile?: ByteSourceReadProfile,
) {
  return renderHook(() =>
    useModalLayout({
      availableTileTypes: tileTypesFor({
        hasNumericSeries: true,
        hasRawRecords: true,
        hasStateAction: false,
        hasTransformTopology: false,
        sourceTypes: sources.map((source) => source.type),
      }),
      resolveTile: getTileDefinition,
      sources,
      datasetId,
      cameraPreferenceField,
      capabilities: STRONG_CAPABILITIES,
      readProfile,
    }),
  );
}

function renderedSourceOf(tile: { render: () => React.ReactNode }) {
  const { container, unmount } = render(<>{tile.render()}</>);
  const source = container
    .querySelector('[data-testid="image-tile"]')
    ?.getAttribute("data-source");
  unmount();
  return source;
}

describe("useModalLayout", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => cleanup());

  it("derives resolver defaults with a deliberate arrangement", () => {
    const { result } = renderLayoutHook(SCENE_SOURCES);
    expect(Object.keys(result.current.initialTiles)).toEqual([
      "image-1",
      "3d-1",
    ]);
    expect(result.current.initialTiles["image-1"].title).toBe("cam");
    expect(result.current.initialLayout).toMatchObject({
      direction: "column",
      first: "3d-1",
      second: "image-1",
    });
    expect(result.current.defaultLeftOpen).toBe(true);
  });

  it("defaults remote sampling to Economy and local sampling to Balanced", () => {
    const remote = renderLayoutHook(
      SCENE_SOURCES,
      "remote",
      undefined,
      BYTE_SOURCE_READ_PROFILE.REMOTE,
    );
    expect(remote.result.current.timelineSamplingRateHz).toBe(24);
    remote.unmount();

    const local = renderLayoutHook(
      SCENE_SOURCES,
      "local",
      undefined,
      BYTE_SOURCE_READ_PROFILE.LOCAL,
    );
    expect(local.result.current.timelineSamplingRateHz).toBe(30);
  });

  it("persists an explicit sampling rate in the active layout scope", () => {
    const { result } = renderLayoutHook(
      SCENE_SOURCES,
      "dataset-a",
      undefined,
      BYTE_SOURCE_READ_PROFILE.REMOTE,
    );

    act(() => result.current.onTimelineSamplingRateChange(60));

    expect(result.current.timelineSamplingRateHz).toBe(60);
    expect(readModalLayout("dataset-a")?.timelineSamplingRateHz).toBe(60);
  });

  it("opens one tile per image source bound to distinct streams", () => {
    const { result } = renderLayoutHook([
      {
        id: "/a",
        label: "a",
        recordCount: 10,
        sourceName: "/a",
        type: "image",
      },
      {
        id: "/b",
        label: "b",
        recordCount: 90,
        sourceName: "/b",
        type: "image",
      },
      SCENE_SOURCES[1],
    ]);

    expect(Object.keys(result.current.initialTiles)).toEqual([
      "image-1",
      "image-2",
      "3d-1",
    ]);
    // Densest stream binds the first tile.
    expect(renderedSourceOf(result.current.initialTiles["image-1"])).toBe("/b");
    expect(renderedSourceOf(result.current.initialTiles["image-2"])).toBe("/a");
  });

  it("opens default image tiles on preferred equivalents only", () => {
    const { result } = renderLayoutHook([
      {
        id: "/cam/image",
        label: "raw",
        recordCount: 1_000,
        sourceName: "/cam/image",
        type: "image",
      },
      {
        id: "/cam/image_downsampled",
        label: "downsampled",
        recordCount: 100,
        sourceName: "/cam/image_downsampled",
        type: "image",
      },
      {
        id: "/rear/image",
        label: "rear",
        recordCount: 900,
        sourceName: "/rear/image",
        type: "image",
      },
    ]);

    expect(Object.keys(result.current.initialTiles)).toEqual([
      "image-1",
      "image-2",
    ]);
    expect(renderedSourceOf(result.current.initialTiles["image-1"])).toBe(
      "/cam/image_downsampled",
    );
    expect(renderedSourceOf(result.current.initialTiles["image-2"])).toBe(
      "/rear/image",
    );
  });

  it("restores image bindings without requiring an edited mosaic layout", () => {
    writeSemanticImageBinding("dataset-a", "image-1", "/a");
    const { result } = renderLayoutHook(
      [
        {
          id: "/a",
          label: "a",
          recordCount: 10,
          sourceName: "/a",
          type: "image",
        },
        {
          id: "/b",
          label: "b",
          recordCount: 90,
          sourceName: "/b",
          type: "image",
        },
      ],
      "dataset-a",
    );

    expect(renderedSourceOf(result.current.initialTiles["image-1"])).toBe("/a");
    expect(renderedSourceOf(result.current.initialTiles["image-2"])).toBe("/b");
    expect(readModalLayout("dataset-a")?.layout).toBeUndefined();
  });

  it("uses the first runtime channel for duplicate semantic image sources", () => {
    writeSemanticImageBinding("dataset-a", "image-1", "/camera/front");
    const { result } = renderLayoutHook(
      [
        {
          id: "channel-7",
          label: "front duplicate 1",
          sourceName: "/camera/front",
          type: "image",
        },
        {
          id: "channel-19",
          label: "front duplicate 2",
          sourceName: "/camera/front",
          type: "image",
        },
      ],
      "dataset-a",
    );

    expect(renderedSourceOf(result.current.initialTiles["image-1"])).toBe(
      "channel-7",
    );
  });

  it("omits default tiles for types absent from the scene", () => {
    const { result } = renderLayoutHook([SCENE_SOURCES[0]]);
    expect(Object.keys(result.current.initialTiles)).toEqual(["image-1"]);
  });

  it("restores persisted sidebar state and a valid tile arrangement", () => {
    writeModalLayout({
      leftSidebarOpen: false,
      layout: {
        direction: "row",
        first: "image-default",
        second: "3d-7",
        splitPercentage: 70,
      },
    });
    const { result } = renderLayoutHook(SCENE_SOURCES);
    expect(result.current.defaultLeftOpen).toBe(false);
    expect(result.current.initialLayout).toEqual({
      direction: "row",
      first: "image-default",
      second: "3d-7",
      splitPercentage: 70,
    });
    expect(Object.keys(result.current.initialTiles).sort()).toEqual([
      "3d-7",
      "image-default",
    ]);
    expect(result.current.initialTiles["image-default"].title).toBe("Image");
    expect(result.current.initialTiles["3d-7"].title).toBe("3D");
    expect(Object.keys(result.current.resetTiles)).toEqual(["image-1", "3d-1"]);
  });

  it("restores manual tile titles for surviving leaves", () => {
    writeModalLayout(
      {
        layout: {
          direction: "row",
          first: "image-default",
          second: "3d-7",
        },
        tileTitles: { "image-default": "Front Camera", "radar-1": "Radar" },
      },
      "dataset-a",
    );

    const { result } = renderLayoutHook(SCENE_SOURCES, "dataset-a");

    expect(result.current.initialTiles["image-default"].title).toBe(
      "Front Camera",
    );
    expect(result.current.initialTiles["3d-7"].title).toBe("3D");
    expect(result.current.initialManualTileTitles).toEqual({
      "image-default": "Front Camera",
    });
  });

  it("restores and updates camera conventions in the selected media field", () => {
    writeCameraPreferences(
      {
        defaultTrackingMode: "heading",
        preferredCameraTargetFrameId: "base_link",
        preferredWorldFrameId: "map",
        sceneUpAxis: "y",
      },
      "dataset-a",
      "mcap",
    );
    const { result } = renderLayoutHook(SCENE_SOURCES, "dataset-a", "mcap");

    expect(result.current.defaultTrackingMode).toBe("heading");
    expect(result.current.preferredCameraTargetFrameId).toBe("base_link");
    expect(result.current.preferredWorldFrameId).toBe("map");
    expect(result.current.sceneUpAxis).toBe("y");

    act(() => {
      result.current.onDefaultTrackingModeChange("free");
      result.current.onPreferredCameraTargetFrameIdChange("sensor_link");
      result.current.onPreferredWorldFrameIdChange("odom");
      result.current.onSceneUpAxisChange("z");
    });

    expect(result.current.defaultTrackingMode).toBe("free");
    expect(result.current.preferredCameraTargetFrameId).toBe("sensor_link");
    expect(result.current.preferredWorldFrameId).toBe("odom");
    expect(result.current.sceneUpAxis).toBe("z");
    expect(readCameraPreferences("dataset-a", "mcap")).toMatchObject({
      defaultTrackingMode: "free",
      preferredCameraTargetFrameId: "sensor_link",
      preferredWorldFrameId: "odom",
      sceneUpAxis: "z",
    });

    act(() => result.current.onPreferredWorldFrameIdChange(null));

    expect(result.current.preferredWorldFrameId).toBeNull();
    expect(
      readCameraPreferences("dataset-a", "mcap")?.preferredWorldFrameId,
    ).toBeUndefined();
  });

  it("falls back to dataset-scoped scene-axis persistence without a media field", () => {
    const { result } = renderLayoutHook(SCENE_SOURCES, "dataset-a");

    act(() => result.current.onSceneUpAxisChange("y"));

    expect(readModalLayout("dataset-a")?.sceneUpAxis).toBe("y");
  });

  it("restores expanded tile state when the tile survives layout restore", () => {
    writeModalLayout({
      expandedTileId: "3d-7",
      layout: {
        direction: "row",
        first: "image-default",
        second: "3d-7",
        splitPercentage: 70,
      },
    });

    const { result } = renderLayoutHook(SCENE_SOURCES);

    expect(result.current.initialExpandedTileId).toBe("3d-7");
  });

  it("rebinds restored image tiles positionally to ranked sources", () => {
    writeModalLayout({
      layout: {
        direction: "row",
        first: "image-3",
        second: "image-8",
      },
    });
    const { result } = renderLayoutHook([
      {
        id: "/a",
        label: "a",
        recordCount: 10,
        sourceName: "/a",
        type: "image",
      },
      {
        id: "/b",
        label: "b",
        recordCount: 90,
        sourceName: "/b",
        type: "image",
      },
    ]);

    expect(renderedSourceOf(result.current.initialTiles["image-3"])).toBe("/b");
    expect(renderedSourceOf(result.current.initialTiles["image-8"])).toBe("/a");
  });

  it("restores valid image bindings by tile id", () => {
    writeSemanticImageBinding("dataset-a", "image-3", "/a");
    writeSemanticImageBinding("dataset-a", "image-8", "/b");
    writeModalLayout(
      {
        layout: {
          direction: "row",
          first: "image-3",
          second: "image-8",
        },
      },
      "dataset-a",
    );
    const { result } = renderLayoutHook(
      [
        {
          id: "/a",
          label: "a",
          recordCount: 10,
          sourceName: "/a",
          type: "image",
        },
        {
          id: "/b",
          label: "b",
          recordCount: 90,
          sourceName: "/b",
          type: "image",
        },
      ],
      "dataset-a",
    );

    expect(renderedSourceOf(result.current.initialTiles["image-3"])).toBe("/a");
    expect(renderedSourceOf(result.current.initialTiles["image-8"])).toBe("/b");
  });

  it("keeps ranked fallbacks distinct from valid restored bindings", () => {
    writeSemanticImageBinding("dataset-a", "image-3", "/missing");
    writeSemanticImageBinding("dataset-a", "image-8", "/b");
    writeModalLayout(
      {
        layout: {
          direction: "row",
          first: "image-3",
          second: "image-8",
        },
      },
      "dataset-a",
    );
    const { result } = renderLayoutHook(
      [
        {
          id: "/a",
          label: "a",
          recordCount: 10,
          sourceName: "/a",
          type: "image",
        },
        {
          id: "/b",
          label: "b",
          recordCount: 90,
          sourceName: "/b",
          type: "image",
        },
      ],
      "dataset-a",
    );

    expect(renderedSourceOf(result.current.initialTiles["image-3"])).toBe("/a");
    expect(renderedSourceOf(result.current.initialTiles["image-8"])).toBe("/b");
  });

  it("rebinds restored image tiles to preferred equivalents", () => {
    writeModalLayout({
      layout: {
        direction: "row",
        first: "image-3",
        second: "image-8",
      },
    });
    const { result } = renderLayoutHook([
      {
        id: "/cam/image",
        label: "raw",
        recordCount: 1_000,
        sourceName: "/cam/image",
        type: "image",
      },
      {
        id: "/cam/image_downsampled",
        label: "downsampled",
        recordCount: 100,
        sourceName: "/cam/image_downsampled",
        type: "image",
      },
      {
        id: "/rear/image",
        label: "rear",
        recordCount: 900,
        sourceName: "/rear/image",
        type: "image",
      },
    ]);

    expect(renderedSourceOf(result.current.initialTiles["image-3"])).toBe(
      "/cam/image_downsampled",
    );
    expect(renderedSourceOf(result.current.initialTiles["image-8"])).toBe(
      "/rear/image",
    );
  });

  it("prunes leaves with unknown tile types and promotes the sibling", () => {
    writeModalLayout({
      expandedTileId: "radar-2",
      layout: {
        direction: "row",
        first: "image-default",
        second: "radar-2",
      },
    });
    const { result } = renderLayoutHook(SCENE_SOURCES);
    expect(result.current.initialLayout).toBe("image-default");
    expect(result.current.initialExpandedTileId).toBeNull();
    expect(Object.keys(result.current.initialTiles)).toEqual(["image-default"]);
  });

  it("preserves a namespaced extension leaf with an unavailable placeholder", () => {
    writeModalLayout({ layout: "acme:radar-2" });
    const { result } = renderLayoutHook(SCENE_SOURCES);

    expect(result.current.initialLayout).toBe("acme:radar-2");
    expect(result.current.initialTiles["acme:radar-2"].title).toBe(
      "Unavailable tile",
    );
    const view = render(
      <>{result.current.initialTiles["acme:radar-2"].render()}</>,
    );
    expect(view.getByText(/acme:radar/)).toBeTruthy();
    view.unmount();
  });

  it("prunes leaves whose tile kind has no source in the scene", () => {
    // A layout saved with a 3D stream, opened on an image-only recording,
    // keeps its image tile instead of resetting.
    writeModalLayout({
      layout: {
        direction: "row",
        first: "image-default",
        second: "3d-default",
      },
    });
    const { result } = renderLayoutHook([SCENE_SOURCES[0]]);
    expect(result.current.initialLayout).toBe("image-default");
    expect(Object.keys(result.current.initialTiles)).toEqual(["image-default"]);
  });

  it("keeps surviving split percentages when pruning a nested leaf", () => {
    writeModalLayout({
      layout: {
        direction: "row",
        splitPercentage: 70,
        first: {
          direction: "column",
          splitPercentage: 30,
          first: "image-default",
          second: "radar-9",
        },
        second: "3d-1",
      },
    });
    const { result } = renderLayoutHook(SCENE_SOURCES);
    expect(result.current.initialLayout).toEqual({
      direction: "row",
      splitPercentage: 70,
      first: "image-default",
      second: "3d-1",
    });
  });

  it("falls back to resolver defaults when every leaf is pruned", () => {
    writeModalLayout({
      layout: { direction: "row", first: "radar-1", second: "radar-2" },
    });
    const { result } = renderLayoutHook(SCENE_SOURCES);
    expect(Object.keys(result.current.initialTiles)).toEqual([
      "image-1",
      "3d-1",
    ]);
    expect(result.current.initialLayout).toMatchObject({
      first: "3d-1",
      second: "image-1",
    });
  });

  it("rebinds surviving image leaves positionally after pruning", () => {
    writeModalLayout({
      layout: {
        direction: "row",
        first: "image-3",
        second: { direction: "column", first: "radar-2", second: "image-8" },
      },
    });
    const { result } = renderLayoutHook([
      {
        id: "/a",
        label: "a",
        recordCount: 10,
        sourceName: "/a",
        type: "image",
      },
      {
        id: "/b",
        label: "b",
        recordCount: 90,
        sourceName: "/b",
        type: "image",
      },
    ]);
    expect(result.current.initialLayout).toEqual({
      direction: "row",
      first: "image-3",
      second: "image-8",
    });
    expect(renderedSourceOf(result.current.initialTiles["image-3"])).toBe("/b");
    expect(renderedSourceOf(result.current.initialTiles["image-8"])).toBe("/a");
  });

  it("reads the arrangement persisted for the given dataset", () => {
    writeModalLayout(
      {
        layout: {
          direction: "row",
          first: "image-1",
          second: "3d-1",
          splitPercentage: 20,
        },
      },
      "dataset-a",
    );
    writeModalLayout(
      {
        layout: {
          direction: "column",
          first: "image-1",
          second: "3d-1",
          splitPercentage: 80,
        },
      },
      "dataset-b",
    );
    const a = renderLayoutHook(SCENE_SOURCES, "dataset-a");
    expect(a.result.current.initialLayout).toMatchObject({
      direction: "row",
      splitPercentage: 20,
    });
    const b = renderLayoutHook(SCENE_SOURCES, "dataset-b");
    expect(b.result.current.initialLayout).toMatchObject({
      direction: "column",
      splitPercentage: 80,
    });
  });

  it("uses resolver defaults for a never-seen dataset", () => {
    writeModalLayout(
      {
        layout: {
          direction: "row",
          first: "image-1",
          second: "3d-1",
          splitPercentage: 20,
        },
      },
      "dataset-a",
    );

    const { result } = renderLayoutHook(SCENE_SOURCES, "dataset-b");

    expect(result.current.initialLayout).toMatchObject({
      direction: "column",
      first: "3d-1",
      second: "image-1",
    });
    expect(result.current.defaultLeftOpen).toBe(true);
  });

  it("restores the persisted sidebar width", () => {
    writeModalLayout({ sidebarWidthPx: 480 }, "dataset-a");
    const { result } = renderLayoutHook(SCENE_SOURCES, "dataset-a");
    expect(result.current.defaultLeftSidebarWidth).toBe(480);
  });

  it("persists sidebar toggles through the change callbacks", () => {
    const { result } = renderLayoutHook(SCENE_SOURCES);
    act(() => result.current.onLeftOpenChange(true));
    const read = readModalLayout();
    expect(read?.leftSidebarOpen).toBe(true);
  });

  it("persists sidebar state and width under the hook's dataset", () => {
    const { result } = renderLayoutHook(SCENE_SOURCES, "dataset-a");
    act(() => result.current.onLeftOpenChange(false));
    act(() => result.current.onLeftSidebarWidthChange(420));
    const read = readModalLayout("dataset-a");
    expect(read?.leftSidebarOpen).toBe(false);
    expect(read?.sidebarWidthPx).toBe(420);
  });

  it("restores and persists the dataset scene up-axis", () => {
    writeModalLayout({ sceneUpAxis: "y" }, "dataset-a");
    const { result } = renderLayoutHook(SCENE_SOURCES, "dataset-a");

    expect(result.current.sceneUpAxis).toBe("y");

    act(() => result.current.onSceneUpAxisChange("x"));

    expect(result.current.sceneUpAxis).toBe("x");
    expect(readModalLayout("dataset-a")?.sceneUpAxis).toBe("x");
    expect(readModalLayout("dataset-b")?.sceneUpAxis).toBeUndefined();
  });

  it("resets scene up-axis when switching to an unsaved dataset", () => {
    const { result, rerender } = renderHook(
      ({ datasetId }: { readonly datasetId: string }) =>
        useModalLayout({
          availableTileTypes: tileTypesFor({
            hasNumericSeries: true,
            hasRawRecords: true,
            hasStateAction: false,
            hasTransformTopology: false,
            sourceTypes: SCENE_SOURCES.map((source) => source.type),
          }),
          resolveTile: getTileDefinition,
          sources: SCENE_SOURCES,
          datasetId,
          capabilities: STRONG_CAPABILITIES,
        }),
      { initialProps: { datasetId: "dataset-a" } },
    );

    act(() => result.current.onSceneUpAxisChange("x"));
    expect(result.current.sceneUpAxis).toBe("x");

    rerender({ datasetId: "dataset-b" });

    expect(result.current.sceneUpAxis).toBe("z");
  });
});

function writeSemanticImageBinding(
  datasetId: string,
  tileId: string,
  sourceName: string,
): void {
  const scope = cameraScopeKey(datasetId, undefined);
  if (!scope) throw new Error("expected a dataset scope");
  const imageSourceKey = semanticSourceKey({ sourceName, type: "image" });
  updateSidebarPreferences(scope, (current) => ({
    ...current,
    tiles: {
      ...current.tiles,
      [tileId]: { ...current.tiles[tileId], imageSourceKey },
    },
  }));
}

describe("pruneMosaicLayout", () => {
  const rejecting =
    (...bad: string[]) =>
    (id: string) =>
      !bad.includes(id);

  it("returns the tree intact when every leaf is valid", () => {
    const tree = {
      direction: "row" as const,
      splitPercentage: 60,
      first: "a-1",
      second: { direction: "column" as const, first: "b-1", second: "c-1" },
    };
    expect(pruneMosaicLayout(tree, () => true)).toEqual(tree);
  });

  it("prunes an invalid root leaf to null", () => {
    expect(pruneMosaicLayout("a-1", rejecting("a-1"))).toBeNull();
  });

  it("promotes the surviving sibling when one child is pruned", () => {
    expect(
      pruneMosaicLayout(
        { direction: "row", first: "a-1", second: "b-1" },
        rejecting("b-1"),
      ),
    ).toBe("a-1");
  });

  it("prunes a parent whose children are both pruned", () => {
    expect(
      pruneMosaicLayout(
        {
          direction: "row",
          first: "a-1",
          second: { direction: "column", first: "b-1", second: "c-1" },
        },
        rejecting("b-1", "c-1"),
      ),
    ).toBe("a-1");
  });

  it("returns null when the whole tree is pruned", () => {
    expect(
      pruneMosaicLayout(
        { direction: "row", first: "a-1", second: "b-1" },
        rejecting("a-1", "b-1"),
      ),
    ).toBeNull();
  });

  it("keeps split percentages of surviving parents", () => {
    expect(
      pruneMosaicLayout(
        {
          direction: "row",
          splitPercentage: 70,
          first: {
            direction: "column",
            splitPercentage: 30,
            first: "a-1",
            second: "bad-1",
          },
          second: "c-1",
        },
        rejecting("bad-1"),
      ),
    ).toEqual({
      direction: "row",
      splitPercentage: 70,
      first: "a-1",
      second: "c-1",
    });
  });
});

describe("ModalLayoutPersistence", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  function LayoutDriver({ next }: { next: string | null }) {
    const { setLayout } = useTiling();
    // This effect drives layout from test props — stand-in for the
    // user rearranging tiles.
    useEffect(() => {
      setLayout(next);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [next]);
    return null;
  }

  function ExpandedDriver({ next }: { next: string | null }) {
    const { setExpandedTileId } = useTiling();
    // This effect drives fullscreen state from test props — stand-in
    // for the user toggling a tile's fullscreen button.
    useEffect(() => {
      setExpandedTileId(next);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [next]);
    return null;
  }

  function TitleDriver({
    tileId,
    title,
  }: {
    readonly tileId: string;
    readonly title: string;
  }) {
    const { setTileTitle } = useTiling();
    // This effect drives the manual title from test props.
    useEffect(() => {
      setTileTitle(tileId, title);
    }, [setTileTitle, tileId, title]);
    return null;
  }

  function Scene3dSettingsDriver({
    enabled,
    tileId,
  }: {
    readonly enabled: boolean | null;
    readonly tileId: string;
  }) {
    const store = useStore();
    // This effect drives tile playback settings from test props.
    useEffect(() => {
      if (enabled === null) return;
      store.set(scene3dTilePlaybackSettingsAtom, (previous) => ({
        ...previous,
        [tileId]: { smoothTrackedLabels: enabled },
      }));
    }, [enabled, store, tileId]);
    return null;
  }

  function Scene3dSettingsProbe({
    onValue,
  }: {
    readonly onValue: (value: Scene3dTilePlaybackSettingsByTile) => void;
  }) {
    const value = useAtomValue(scene3dTilePlaybackSettingsAtom);
    // This effect exposes atom updates to the test assertion.
    useEffect(() => {
      onValue(value);
    }, [onValue, value]);
    return null;
  }

  // Two tiles so the provider's derived initial layout differs from the
  // single-leaf arrangement the driver applies — persistence only writes
  // once the layout changes from what the mount started with.
  const TWO_TILES = {
    "camera-default": { title: "Camera", render: () => null },
    "lidar-default": { title: "Lidar", render: () => null },
  };

  it("writes layout changes after the debounce window", () => {
    render(
      <TilingProvider initialTiles={TWO_TILES}>
        <LayoutDriver next="camera-default" />
        <ModalLayoutPersistence />
      </TilingProvider>,
    );

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(readModalLayout()?.layout).toBe("camera-default");
  });

  it("flushes the latest layout on unmount even when the debounce is pending", () => {
    const { unmount } = render(
      <TilingProvider initialTiles={TWO_TILES}>
        <LayoutDriver next="camera-default" />
        <ModalLayoutPersistence />
      </TilingProvider>,
    );

    // Unmount before the 500ms debounce fires.
    unmount();
    expect(readModalLayout()?.layout).toBe("camera-default");
  });

  it("writes under the dataset it was given", () => {
    render(
      <TilingProvider initialTiles={TWO_TILES}>
        <LayoutDriver next="camera-default" />
        <ModalLayoutPersistence datasetId="dataset-a" />
      </TilingProvider>,
    );

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(readModalLayout("dataset-a")?.layout).toBe("camera-default");
  });

  it("writes expanded tile changes after the debounce window", () => {
    render(
      <TilingProvider initialTiles={TWO_TILES}>
        <ExpandedDriver next="camera-default" />
        <ModalLayoutPersistence datasetId="dataset-a" />
      </TilingProvider>,
    );

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(readModalLayout("dataset-a")?.expandedTileId).toBe("camera-default");
    expect(readModalLayout("dataset-a")?.layout).toBeUndefined();
  });

  it("writes manual title changes after the debounce window", () => {
    render(
      <TilingProvider initialTiles={TWO_TILES}>
        <TitleDriver tileId="camera-default" title="Front Camera" />
        <ModalLayoutPersistence datasetId="dataset-a" />
      </TilingProvider>,
    );

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(readModalLayout("dataset-a")?.tileTitles).toEqual({
      "camera-default": "Front Camera",
    });
  });

  it("mirrors 3D smoothing into the active dataset and tile", () => {
    const tiles = {
      "3d-1": { title: "3D", render: () => null },
      "3d-2": { title: "3D compare", render: () => null },
    };
    const { rerender } = render(
      <TilingProvider initialTiles={tiles}>
        <Scene3dSettingsDriver enabled={null} tileId="3d-1" />
        <ModalLayoutPersistence datasetId="dataset-a" />
      </TilingProvider>,
    );

    rerender(
      <TilingProvider initialTiles={tiles}>
        <Scene3dSettingsDriver enabled tileId="3d-1" />
        <ModalLayoutPersistence datasetId="dataset-a" />
      </TilingProvider>,
    );
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(readModalLayout("dataset-a")?.scene3dSettings).toEqual({
      "3d-1": { smoothTrackedLabels: true },
    });
    expect(readModalLayout("dataset-b")?.scene3dSettings).toBeUndefined();
  });

  it("restores 3D smoothing for a surviving tile", () => {
    writeModalLayout(
      {
        scene3dSettings: {
          "3d-1": { smoothTrackedLabels: true },
        },
      },
      "dataset-a",
    );
    const values: unknown[] = [];

    render(
      <TilingProvider
        initialTiles={{ "3d-1": { title: "3D", render: () => null } }}
      >
        <Scene3dSettingsProbe onValue={(value) => values.push(value)} />
        <ModalLayoutPersistence datasetId="dataset-a" />
      </TilingProvider>,
    );

    expect(values.at(-1)).toEqual({
      "3d-1": { smoothTrackedLabels: true },
    });
  });

  it("flushes expanded tile changes on unmount even when the debounce is pending", () => {
    const { unmount } = render(
      <TilingProvider initialTiles={TWO_TILES}>
        <ExpandedDriver next="camera-default" />
        <ModalLayoutPersistence datasetId="dataset-a" />
      </TilingProvider>,
    );

    unmount();
    expect(readModalLayout("dataset-a")?.expandedTileId).toBe("camera-default");
  });

  it("does not persist a layout the user never edited", () => {
    // A pruned restore mounts as-is; merely viewing it (and closing the
    // modal) must not overwrite the saved arrangement with the pruned tree.
    const { unmount } = render(
      <TilingProvider
        initialTiles={{
          "camera-default": { title: "Camera", render: () => null },
        }}
      >
        <ModalLayoutPersistence datasetId="dataset-a" />
      </TilingProvider>,
    );

    act(() => {
      vi.advanceTimersByTime(600);
    });
    unmount();
    expect(readModalLayout("dataset-a")).toBeNull();
  });
});
