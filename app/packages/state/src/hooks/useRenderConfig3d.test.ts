import { renderHook } from "@testing-library/react-hooks";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModalSample } from "../recoil/modal";
import {
  useRenderConfig3dActions,
  useRenderConfig3dImperativeState,
  useRenderConfig3dState,
} from "./useRenderConfig3d";

const mockInternals = vi.hoisted(() => ({
  groupMediaIs3dVisible: { key: "groupMediaIs3dVisible" },
  groupMedia3dVisibleSetting: { key: "groupMedia3dVisibleSetting" },
  is3dPinned: { key: "is3dPinned" },
  has3dSlice: { key: "has3dSlice" },
  hasFo3dSlice: { key: "hasFo3dSlice" },
  pinned3DSampleSlice: { key: "pinned3DSampleSlice" },
  active3dSlices: { key: "active3dSlices" },
  all3dSlices: { key: "all3dSlices" },
  allNon3dSlices: { key: "allNon3dSlices" },
  hasMultiple3dSlices: { key: "hasMultiple3dSlices" },
  realFo3dSlices: { key: "realFo3dSlices" },
  activeFo3dSlice: { key: "activeFo3dSlice" },
  activeNonFo3d3dSlices: { key: "activeNonFo3d3dSlices" },
  interaction3dSample: { key: "interaction3dSample" },
  interaction3dSlice: { key: "interaction3dSlice" },
  sceneSample: { key: "sceneSample" },
  fo3dContent: { key: "fo3dContent" },
  active3dSlicesToSampleMap: { key: "active3dSlicesToSampleMap" },
  all3dSlicesToSampleMap: { key: "all3dSlicesToSampleMap" },
}));

const mockGroups = vi.hoisted(() => ({
  groupMediaTypesMap: { key: "groupMediaTypesMap" },
  groupMediaIsMain2DViewerVisibleSetting: {
    key: "groupMediaIsMain2DViewerVisibleSetting",
  },
  groupMediaIsCarouselVisibleSetting: {
    key: "groupMediaIsCarouselVisibleSetting",
  },
}));

const stateStore = vi.hoisted(() => ({
  values: {} as Record<string, unknown>,
  loadables: {} as Record<string, { state: string; contents: unknown }>,
}));

vi.mock("../recoil/renderConfig3d.atoms", () => mockInternals);
vi.mock("../recoil/groups", () => mockGroups);

vi.mock("recoil", async () => {
  const actual = await vi.importActual<typeof import("recoil")>("recoil");

  const getValue = (node: { key: string }) => {
    return stateStore.values[node.key];
  };

  const setValue = (node: { key: string }, value: unknown) => {
    const current = stateStore.values[node.key];
    const next = value instanceof Function ? value(current) : value;
    stateStore.values[node.key] = next;
    stateStore.loadables[node.key] = {
      state: "hasValue",
      contents: next,
    };
  };

  return {
    ...actual,
    useRecoilValue: (node: { key: string }) => getValue(node),
    useRecoilValueLoadable: (node: { key: string }) =>
      stateStore.loadables[node.key] ?? {
        state: "hasValue",
        contents: getValue(node),
      },
    useRecoilCallback:
      (
        callback: (interfaceArgs: {
          snapshot: { getPromise: (node: { key: string }) => Promise<unknown> };
          set: (node: { key: string }, value: unknown) => void;
        }) => (...args: unknown[]) => unknown,
      ) =>
      (...args: unknown[]) =>
        callback({
          snapshot: {
            getPromise: async (node: { key: string }) => {
              const loadable = stateStore.loadables[node.key];

              if (loadable) {
                if (loadable.state === "hasValue") {
                  return loadable.contents;
                }

                throw loadable.contents;
              }

              return getValue(node);
            },
          },
          set: setValue,
        })(...args),
  };
});

const buildModalSample = (id: string, filepath: string): ModalSample => {
  return {
    id,
    sample: {
      _id: id,
      filepath,
    },
    urls: {
      filepath,
    },
  } as unknown as ModalSample;
};

const setState = (values: Record<string, unknown>) => {
  stateStore.values = {
    groupMediaIs3dVisible: true,
    groupMedia3dVisibleSetting: true,
    is3dPinned: false,
    has3dSlice: true,
    hasFo3dSlice: false,
    pinned3DSampleSlice: null,
    active3dSlices: [],
    all3dSlices: ["lidar", "scene", "scene-b"],
    allNon3dSlices: ["image"],
    hasMultiple3dSlices: true,
    realFo3dSlices: ["scene", "scene-b"],
    activeFo3dSlice: null,
    activeNonFo3d3dSlices: [],
    interaction3dSample: buildModalSample("modal-id", "/tmp/modal.png"),
    interaction3dSlice: null,
    sceneSample: buildModalSample("modal-id", "/tmp/modal.png"),
    fo3dContent: null,
    groupMediaTypesMap: {
      image: "image",
      lidar: "pcd",
      scene: "3d",
      "scene-b": "3d",
    },
    groupMediaIsMain2DViewerVisibleSetting: true,
    groupMediaIsCarouselVisibleSetting: true,
    ...values,
  };

  stateStore.loadables = {
    active3dSlicesToSampleMap: {
      state: "hasValue",
      contents: (stateStore.values.active3dSlicesToSampleMap ?? {}) as Record<
        string,
        ModalSample
      >,
    },
    all3dSlicesToSampleMap: {
      state: "hasValue",
      contents: (stateStore.values.all3dSlicesToSampleMap ?? {}) as Record<
        string,
        ModalSample
      >,
    },
  };
};

const useRenderConfig3dHooks = () => {
  const state = useRenderConfig3dState();
  const actions = useRenderConfig3dActions();
  const query = useRenderConfig3dImperativeState();

  return {
    state,
    actions,
    query,
  };
};

describe("useRenderConfig3d split hooks", () => {
  beforeEach(() => {
    const sceneSample = buildModalSample("scene-id", "/tmp/scene.fo3d");
    const sceneBSample = buildModalSample("scene-b-id", "/tmp/scene-b.fo3d");
    const lidarSample = buildModalSample("lidar-id", "/tmp/lidar.pcd");

    setState({
      active3dSlicesToSampleMap: {
        scene: sceneSample,
        lidar: lidarSample,
      },
      all3dSlicesToSampleMap: {
        scene: sceneSample,
        "scene-b": sceneBSample,
        lidar: lidarSample,
      },
    });
  });

  it("returns the public 3d render config state bundle", () => {
    const interactionSample = buildModalSample("lidar-id", "/tmp/lidar.pcd");
    const sceneSample = buildModalSample("scene-id", "/tmp/scene.fo3d");

    setState({
      is3dPinned: true,
      pinned3DSampleSlice: "lidar",
      active3dSlices: ["lidar", "scene"],
      activeFo3dSlice: "scene",
      activeNonFo3d3dSlices: ["lidar"],
      interaction3dSample: interactionSample,
      interaction3dSlice: "lidar",
      sceneSample,
      fo3dContent: { name: "scene" },
    });

    const { result } = renderHook(() => useRenderConfig3dHooks());

    expect(result.current.state.pinnedSlice).toBe("lidar");
    expect(result.current.state.activeFo3dSlice).toBe("scene");
    expect(result.current.state.activeDirectSlices).toEqual(["lidar"]);
    expect(result.current.state.interactionSample).toBe(interactionSample);
    expect(result.current.state.sceneSample).toBe(sceneSample);
    expect(result.current.state.fo3dContent).toEqual({ name: "scene" });
  });

  it("exposes imperative querying via query.getIsPinned", async () => {
    setState({
      is3dPinned: true,
    });

    const { result } = renderHook(() => useRenderConfig3dHooks());
    const isPinned = await result.current.query.getIsPinned();

    expect(isPinned).toBe(true);
  });

  it("initializes render config 3d from a 3d modal slice", async () => {
    const { result } = renderHook(() => useRenderConfig3dHooks());

    await result.current.actions.initializeFromModalSlice("lidar");

    expect(stateStore.values.active3dSlices).toEqual(["lidar"]);
    expect(stateStore.values.pinned3DSampleSlice).toBe("lidar");
    expect(stateStore.values.is3dPinned).toBe(true);
  });

  it("clears 3d render config for a non-3d modal slice", async () => {
    setState({
      is3dPinned: true,
      pinned3DSampleSlice: "lidar",
      active3dSlices: ["lidar"],
    });

    const { result } = renderHook(() => useRenderConfig3dHooks());

    await result.current.actions.initializeFromModalSlice("image");

    expect(stateStore.values.active3dSlices).toEqual([]);
    expect(stateStore.values.pinned3DSampleSlice).toBeNull();
    expect(stateStore.values.is3dPinned).toBe(false);
  });

  it("replaces the active fo3d slice while preserving direct slices", async () => {
    const sceneSample = buildModalSample("scene-id", "/tmp/scene.fo3d");
    const sceneBSample = buildModalSample("scene-b-id", "/tmp/scene-b.fo3d");
    const lidarSample = buildModalSample("lidar-id", "/tmp/lidar.pcd");

    setState({
      pinned3DSampleSlice: "lidar",
      active3dSlices: ["lidar", "scene"],
      activeFo3dSlice: "scene",
      activeNonFo3d3dSlices: ["lidar"],
      active3dSlicesToSampleMap: {
        scene: sceneSample,
        lidar: lidarSample,
      },
      all3dSlicesToSampleMap: {
        scene: sceneSample,
        "scene-b": sceneBSample,
        lidar: lidarSample,
      },
    });

    const { result } = renderHook(() => useRenderConfig3dHooks());

    await result.current.actions.toggleSlice("scene-b", true);

    expect(stateStore.values.active3dSlices).toEqual(["lidar", "scene-b"]);
    expect(stateStore.values.pinned3DSampleSlice).toBe("lidar");
  });

  it("reconciles the pinned slice when it is no longer available", async () => {
    const lidarSample = buildModalSample("lidar-id", "/tmp/lidar.pcd");

    setState({
      is3dPinned: true,
      pinned3DSampleSlice: "scene",
      active3dSlices: ["scene", "lidar"],
      active3dSlicesToSampleMap: {
        lidar: lidarSample,
      },
      all3dSlicesToSampleMap: {
        lidar: lidarSample,
      },
    });

    const { result } = renderHook(() => useRenderConfig3dHooks());

    await result.current.actions.reconcileAvailableSlices();

    expect(stateStore.values.active3dSlices).toEqual(["lidar"]);
    expect(stateStore.values.pinned3DSampleSlice).toBe("lidar");
  });

  it("focuses non-3d slices by hiding the 3d viewer and clearing the pin", async () => {
    setState({
      is3dPinned: true,
      pinned3DSampleSlice: "lidar",
      active3dSlices: ["lidar"],
      groupMediaIsMain2DViewerVisibleSetting: false,
      groupMediaIsCarouselVisibleSetting: true,
      groupMedia3dVisibleSetting: true,
    });

    const { result } = renderHook(() => useRenderConfig3dHooks());

    await result.current.actions.focusSlice("image");

    expect(stateStore.values.groupMediaIsMain2DViewerVisibleSetting).toBe(true);
    expect(stateStore.values.groupMedia3dVisibleSetting).toBe(false);
    expect(stateStore.values.groupMediaIsCarouselVisibleSetting).toBe(false);
    expect(stateStore.values.is3dPinned).toBe(false);
  });
});
