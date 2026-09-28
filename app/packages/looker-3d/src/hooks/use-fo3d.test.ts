import { act, renderHook } from "@testing-library/react";
import type { ModalSample } from "@fiftyone/state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FiftyoneSceneRawJson } from "../utils";
import { useFo3d } from "./use-fo3d";

const mockAtoms = vi.hoisted(() => ({
  selectedMediaField: { key: "selectedMediaField" },
  isGroup: { key: "isGroup" },
}));

const mockState = vi.hoisted(() => ({
  mediaField: "filepath",
  isGroup: false,
  group3dState: {
    activeFo3dSlice: null as string | null,
    activeDirectSlices: [] as string[],
    activeSlices: [] as string[],
    activeSampleMap: {} as Record<string, ModalSample>,
    allSampleMap: {} as Record<string, ModalSample>,
    realFo3dSlices: [] as string[],
  },
  setFo3dContent: vi.fn(),
  fetchFo3d: vi.fn(),
  getSampleSrc: vi.fn((path: string) => `src:${path}`),
  buildFoScene: vi.fn((rawData: FiftyoneSceneRawJson) => rawData),
  getRootAssetCount: vi.fn(
    (scene: FiftyoneSceneRawJson | null) => scene?.children?.length ?? 0,
  ),
  directPcdAlignment: {
    error: null as Error | null,
    isLoading: false,
    transformsBySlice: {},
  },
}));

vi.mock("@fiftyone/state", () => ({
  selectedMediaField: () => mockAtoms.selectedMediaField,
  isGroup: mockAtoms.isGroup,
  getSampleSrc: mockState.getSampleSrc,
  useRenderConfig3dState: () => mockState.group3dState,
  useRenderConfig3dActions: () => ({
    setFo3dContent: mockState.setFo3dContent,
  }),
}));

vi.mock("recoil", async () => {
  const actual = await vi.importActual<typeof import("recoil")>("recoil");

  return {
    ...actual,
    useRecoilValue: (atom: { key?: string }) => {
      switch (atom) {
        case mockAtoms.selectedMediaField:
          return mockState.mediaField;
        case mockAtoms.isGroup:
          return mockState.isGroup;
        default:
          return null;
      }
    },
  };
});

vi.mock("./use-fo3d-fetcher", () => ({
  default: () => mockState.fetchFo3d,
}));

vi.mock("./use-fo3d-scene-parser", () => ({
  buildFoScene: mockState.buildFoScene,
  getRootAssetCount: mockState.getRootAssetCount,
}));

vi.mock("./use-grouped-direct-pcd-world-transforms", () => ({
  useGroupedDirectPcdWorldTransforms: () => mockState.directPcdAlignment,
}));

const DEFAULT_MATERIAL = {
  _type: "MeshStandardMaterial",
  color: "#ffffff",
  emissiveColor: "#000000",
  emissiveIntensity: 0,
  metalness: 0,
  roughness: 1,
  opacity: 1,
  vertexColors: true,
  wireframe: false,
};

const buildModalSample = (id: string, filepath: string): ModalSample => {
  return {
    sample: {
      _id: id,
      filepath,
    },
    urls: {
      filepath,
    },
  } as unknown as ModalSample;
};

const buildRawScene = (childName: string): FiftyoneSceneRawJson => ({
  _type: "Scene",
  name: "root",
  visible: true,
  position: [0, 0, 0],
  quaternion: [0, 0, 0, 1],
  scale: [1, 1, 1],
  defaultMaterial: DEFAULT_MATERIAL,
  camera: {
    position: null,
    lookAt: null,
    up: "Z",
    fov: 50,
    aspect: 1,
    near: 0.1,
    far: 5000,
  },
  background: null,
  lights: null,
  children: [
    {
      _type: "GltfMesh",
      name: childName,
      visible: true,
      position: [0, 0, 0],
      quaternion: [0, 0, 0, 1],
      scale: [1, 1, 1],
      defaultMaterial: DEFAULT_MATERIAL,
      children: [],
      gltfPath: "scene.glb",
    } as unknown as FiftyoneSceneRawJson,
  ],
});

const getLastNonNullFo3dContent = () => {
  return mockState.setFo3dContent.mock.calls
    .map(([value]) => value)
    .filter(Boolean)
    .at(-1);
};

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

describe("useFo3d", () => {
  beforeEach(() => {
    mockState.mediaField = "filepath";
    mockState.isGroup = false;
    mockState.group3dState = {
      activeFo3dSlice: null,
      activeDirectSlices: [],
      activeSlices: [],
      activeSampleMap: {},
      allSampleMap: {},
      realFo3dSlices: [],
    };
    mockState.setFo3dContent.mockReset();
    mockState.fetchFo3d.mockReset();
    mockState.getSampleSrc.mockClear();
    mockState.buildFoScene.mockClear();
    mockState.getRootAssetCount.mockClear();
    mockState.directPcdAlignment = {
      error: null,
      isLoading: false,
      transformsBySlice: {},
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("keeps direct-only grouped scenes synthetic without fetching fo3d", async () => {
    const pcdSample = buildModalSample("pcd-id", "/tmp/group/lidar.pcd");
    const meshSample = buildModalSample("mesh-id", "/tmp/group/mesh.gltf");

    mockState.isGroup = true;
    mockState.group3dState.activeSlices = ["pcd", "mesh"];
    mockState.group3dState.activeDirectSlices = ["pcd", "mesh"];
    mockState.group3dState.activeSampleMap = {
      pcd: pcdSample,
      mesh: meshSample,
    };
    mockState.group3dState.allSampleMap =
      mockState.group3dState.activeSampleMap;

    const { result } = renderHook(() => useFo3d(pcdSample));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockState.fetchFo3d).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.rootAssetCount).toBe(2);

    const content = getLastNonNullFo3dContent();
    expect(content.children.map((child) => child.name).sort()).toEqual([
      "mesh",
      "pcd",
    ]);
  });

  it("places grouped PCD slices in world and exposes label parent transforms", async () => {
    const leftSample = buildModalSample("left-id", "/tmp/group/left.pcd");
    const rightSample = buildModalSample("right-id", "/tmp/group/right.pcd");

    mockState.isGroup = true;
    mockState.group3dState.activeSlices = ["lidar_left", "lidar_right"];
    mockState.group3dState.activeDirectSlices = ["lidar_left", "lidar_right"];
    mockState.group3dState.activeSampleMap = {
      lidar_left: leftSample,
      lidar_right: rightSample,
    };
    mockState.group3dState.allSampleMap =
      mockState.group3dState.activeSampleMap;
    mockState.directPcdAlignment = {
      error: null,
      isLoading: false,
      transformsBySlice: {
        lidar_left: {
          translation: [-5, 0, 0],
          quaternion: [0, 0, 0, 1],
          source_frame: "lidar_left",
          target_frame: "world",
        },
        lidar_right: {
          translation: [5, 0, 0],
          quaternion: [0, 0, 0, 1],
          source_frame: "lidar_right",
          target_frame: "world",
        },
      },
    };

    const { result } = renderHook(() => useFo3d(leftSample));

    await act(async () => {
      await Promise.resolve();
    });

    const content = getLastNonNullFo3dContent();
    expect(
      Object.fromEntries(
        content.children.map((child) => [child.name, child.position]),
      ),
    ).toEqual({
      lidar_left: [-5, 0, 0],
      lidar_right: [5, 0, 0],
    });
    expect(result.current.directPcdWorldTransformsBySampleId).toEqual({
      "left-id": mockState.directPcdAlignment.transformsBySlice.lidar_left,
      "right-id": mockState.directPcdAlignment.transformsBySlice.lidar_right,
    });
  });

  it("does not render grouped PCDs when configured world alignment fails", async () => {
    const pcdSample = buildModalSample("pcd-id", "/tmp/group/lidar.pcd");

    mockState.isGroup = true;
    mockState.group3dState.activeSlices = ["lidar_top"];
    mockState.group3dState.activeDirectSlices = ["lidar_top"];
    mockState.group3dState.activeSampleMap = { lidar_top: pcdSample };
    mockState.group3dState.allSampleMap =
      mockState.group3dState.activeSampleMap;
    mockState.directPcdAlignment = {
      error: new Error("Unable to align grouped PCD slice to world: lidar_top"),
      isLoading: false,
      transformsBySlice: {},
    };

    const { result } = renderHook(() => useFo3d(pcdSample));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.foScene).toBeNull();
    expect(result.current.loadError?.message).toContain(
      "Unable to align grouped PCD slice to world: lidar_top",
    );
    expect(getLastNonNullFo3dContent()).toBeUndefined();
  });

  it("appends active direct 3d slices onto the active fo3d scene root", async () => {
    const sceneSample = buildModalSample("scene-id", "/tmp/group/scene.fo3d");
    const lidarSample = buildModalSample("lidar-id", "/tmp/group/lidar.pcd");

    mockState.isGroup = true;
    mockState.group3dState.activeFo3dSlice = "scene";
    mockState.group3dState.activeSlices = ["scene", "lidar"];
    mockState.group3dState.activeDirectSlices = ["lidar"];
    mockState.group3dState.realFo3dSlices = ["scene"];
    mockState.group3dState.activeSampleMap = {
      scene: sceneSample,
      lidar: lidarSample,
    };
    mockState.group3dState.allSampleMap =
      mockState.group3dState.activeSampleMap;
    mockState.fetchFo3d.mockResolvedValue(buildRawScene("scene-mesh"));

    const { result } = renderHook(() => useFo3d(sceneSample));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockState.fetchFo3d).toHaveBeenCalledWith(
      "src:/tmp/group/scene.fo3d",
      "/tmp/group/scene.fo3d",
    );
    expect(result.current.isLoading).toBe(false);
    expect(result.current.rootAssetCount).toBe(2);

    const content = getLastNonNullFo3dContent();
    expect(content.children.map((child) => child.name).sort()).toEqual([
      "lidar",
      "scene-mesh",
    ]);
  });

  it("ignores stale fo3d fetches after the scene sample changes", async () => {
    const deferredResponses = [
      createDeferred<FiftyoneSceneRawJson>(),
      createDeferred<FiftyoneSceneRawJson>(),
    ];
    const firstSample = buildModalSample(
      "scene-a-id",
      "/tmp/group/scene-a.fo3d",
    );
    const secondSample = buildModalSample(
      "scene-b-id",
      "/tmp/group/scene-b.fo3d",
    );

    mockState.fetchFo3d
      .mockImplementationOnce(() => deferredResponses[0].promise)
      .mockImplementationOnce(() => deferredResponses[1].promise);

    const { rerender } = renderHook(
      ({ sample }: { sample: ModalSample }) => useFo3d(sample),
      {
        initialProps: {
          sample: firstSample,
        },
      },
    );

    rerender({ sample: secondSample });

    await act(async () => {
      deferredResponses[0].resolve(buildRawScene("stale-scene"));
      await Promise.resolve();
    });

    expect(getLastNonNullFo3dContent()).toBeUndefined();

    await act(async () => {
      deferredResponses[1].resolve(buildRawScene("fresh-scene"));
      await Promise.resolve();
    });

    const content = getLastNonNullFo3dContent();
    expect(content.children[0].name).toBe("fresh-scene");
    expect(mockState.fetchFo3d).toHaveBeenCalledTimes(2);
  });

  it("surfaces fo3d fetch failures without crashing downstream scene rendering", async () => {
    const sceneSample = buildModalSample("scene-id", "/tmp/group/scene.fo3d");
    const loadError = new Error("forced resolve-fo3d failure");
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    mockState.fetchFo3d.mockRejectedValue(loadError);

    const { result } = renderHook(() => useFo3d(sceneSample));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.foScene).toBeNull();
    expect(result.current.rootAssetCount).toBe(0);
    expect(result.current.loadError).toEqual(loadError);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
