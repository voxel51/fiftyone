import { renderHook } from "@testing-library/react-hooks";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useSetExpandedSample, {
  resolveModalMain2dSlice,
  SET_EXPANDED_SAMPLE_SOURCE_NAVIGATION,
} from "./useSetExpandedSample";

const groupMediaTypes = [
  { name: "image", mediaType: "image" },
  { name: "pcd", mediaType: "point-cloud" },
  { name: "ply", mediaType: "3d" },
  { name: "right", mediaType: "image" },
];

const mockDynamicGroupAtoms = vi.hoisted(() => ({
  dynamicGroupIndex: { key: "dynamicGroupIndex" },
  dynamicGroupCurrentElementIndex: {
    key: "dynamicGroupCurrentElementIndex",
  },
}));

const mockGroupAtoms = vi.hoisted(() => ({
  groupSlice: { key: "groupSlice" },
  modalGroupSlice: { key: "modalGroupSlice" },
  groupMediaTypes: { key: "groupMediaTypes" },
  groupHasSampleOnSlice: (params: { groupId: string; slice: string }) => ({
    key: "groupHasSampleOnSlice",
    params,
  }),
}));

const mockRenderConfig3d = vi.hoisted(() => ({
  getIsPinned: vi.fn<() => Promise<boolean>>(),
}));

const stateStore = vi.hoisted(() => ({
  values: {} as Record<string, unknown>,
}));

vi.mock("../recoil", () => ({
  modalSelector: { key: "modalSelector" },
}));

vi.mock("../recoil/dynamicGroups", () => mockDynamicGroupAtoms);
vi.mock("../recoil/groups", () => mockGroupAtoms);
vi.mock("./useRenderConfig3d", () => ({
  useRenderConfig3dImperativeState: () => mockRenderConfig3d,
}));

vi.mock("recoil", async () => {
  const actual = await vi.importActual<typeof import("recoil")>("recoil");

  const getValue = (node: { key: string; params?: unknown }) => {
    if (node.params !== undefined) {
      const resolver = stateStore.values[node.key];
      return resolver instanceof Function ? resolver(node.params) : resolver;
    }

    return stateStore.values[node.key];
  };

  const setValue = (node: { key: string }, value: unknown) => {
    const current = stateStore.values[node.key];
    stateStore.values[node.key] =
      value instanceof Function ? value(current) : value;
  };

  const resetValue = (node: { key: string }) => {
    stateStore.values[node.key] = undefined;
  };

  return {
    ...actual,
    useRecoilCallback:
      (
        callback: (interfaceArgs: {
          snapshot: {
            getLoadable: (node: { key: string; params?: unknown }) => {
              getValue: () => unknown;
            };
            getPromise: (node: {
              key: string;
              params?: unknown;
            }) => Promise<unknown>;
          };
          reset: (node: { key: string }) => void;
          set: (node: { key: string }, value: unknown) => void;
        }) => (...args: unknown[]) => unknown
      ) =>
      (...args: unknown[]) =>
        callback({
          snapshot: {
            getLoadable: (node: { key: string; params?: unknown }) => ({
              getValue: () => getValue(node),
            }),
            getPromise: async (node: { key: string; params?: unknown }) =>
              getValue(node),
          },
          reset: resetValue,
          set: setValue,
        })(...args),
  };
});

const setState = (values: Record<string, unknown>) => {
  stateStore.values = {
    groupSlice: "pcd",
    modalGroupSlice: "ply",
    modalSelector: { id: "current-id", groupId: "current-group-id" },
    groupMediaTypes: [
      { name: "image", mediaType: "image" },
      { name: "pcd", mediaType: "point-cloud" },
      { name: "ply", mediaType: "3d" },
      { name: "right", mediaType: "image" },
    ],
    groupHasSampleOnSlice: () => true,
    ...values,
  };
};

describe("useSetExpandedSample", () => {
  beforeEach(() => {
    mockRenderConfig3d.getIsPinned.mockReset();
    mockRenderConfig3d.getIsPinned.mockResolvedValue(true);
    setState({});
  });

  it("preserves a pinned 3d slice when the destination group still has it", async () => {
    const { result } = renderHook(() => useSetExpandedSample());

    await result.current(
      { id: "next-id", groupId: "next-group-id" },
      { source: SET_EXPANDED_SAMPLE_SOURCE_NAVIGATION }
    );

    expect(stateStore.values.modalGroupSlice).toBe("ply");
    expect(stateStore.values.modalSelector).toEqual({
      id: "next-id",
      groupId: "next-group-id",
    });
  });

  it("falls back to the first non-3d slice when opening the modal from a 3d group view", async () => {
    setState({
      modalSelector: null,
      modalGroupSlice: "pcd",
    });

    const { result } = renderHook(() => useSetExpandedSample());

    await result.current({ id: "next-id", groupId: "next-group-id" });

    expect(stateStore.values.modalGroupSlice).toBe("image");
    expect(stateStore.values.modalSelector).toEqual({
      id: "next-id",
      groupId: "next-group-id",
    });
  });

  it("keeps the 3d baseline when opening a 3d-only destination group", async () => {
    setState({
      modalSelector: null,
      modalGroupSlice: "pcd",
      groupHasSampleOnSlice: () => false,
    });

    const { result } = renderHook(() => useSetExpandedSample());

    await result.current({ id: "next-id", groupId: "next-group-id" });

    expect(stateStore.values.modalGroupSlice).toBe("pcd");
    expect(stateStore.values.modalSelector).toEqual({
      id: "next-id",
      groupId: "next-group-id",
    });
  });

  it("does not overwrite a sparse-group fallback with a missing pinned slice", async () => {
    setState({
      modalGroupSlice: "right",
      groupHasSampleOnSlice: () => false,
    });

    const { result } = renderHook(() => useSetExpandedSample());

    await result.current(
      { id: "next-id", groupId: "next-group-id" },
      { source: SET_EXPANDED_SAMPLE_SOURCE_NAVIGATION }
    );

    expect(stateStore.values.modalGroupSlice).toBe("pcd");
    expect(stateStore.values.modalSelector).toEqual({
      id: "next-id",
      groupId: "next-group-id",
    });
  });

  it("falls back to a deterministic 2d slice when the missing sparse slice is unpinned", async () => {
    mockRenderConfig3d.getIsPinned.mockResolvedValue(false);
    setState({
      modalGroupSlice: "right",
      groupHasSampleOnSlice: ({ slice }: { groupId: string; slice: string }) =>
        slice === "image",
    });

    const { result } = renderHook(() => useSetExpandedSample());

    await result.current(
      { id: "next-id", groupId: "next-group-id" },
      { source: SET_EXPANDED_SAMPLE_SOURCE_NAVIGATION }
    );

    expect(stateStore.values.modalGroupSlice).toBe("image");
    expect(stateStore.values.modalSelector).toEqual({
      id: "next-id",
      groupId: "next-group-id",
    });
  });

  it("preserves a non-3d modal slice when the destination group still has it", async () => {
    mockRenderConfig3d.getIsPinned.mockResolvedValue(false);
    setState({
      modalGroupSlice: "right",
      groupHasSampleOnSlice: () => true,
    });

    const { result } = renderHook(() => useSetExpandedSample());

    await result.current(
      { id: "next-id", groupId: "next-group-id" },
      { source: SET_EXPANDED_SAMPLE_SOURCE_NAVIGATION }
    );

    expect(stateStore.values.modalGroupSlice).toBe("right");
    expect(stateStore.values.modalSelector).toEqual({
      id: "next-id",
      groupId: "next-group-id",
    });
  });
});

describe("resolveModalMain2dSlice", () => {
  it("keeps current modal slice when baseline slice is missing", () => {
    expect(
      resolveModalMain2dSlice({
        groupSlice: null,
        currentModalSlice: "right",
        groupMediaTypes,
        hasExistingModal: true,
        baselineIs3d: false,
        fallbackNon3dSlice: "image",
        is3dPinned: true,
        destinationHasCurrentModalSlice: null,
      })
    ).toBe("right");
  });

  it("falls back to the first non-3d slice for a fresh 3d modal open", () => {
    expect(
      resolveModalMain2dSlice({
        groupSlice: "pcd",
        currentModalSlice: "pcd",
        groupMediaTypes,
        hasExistingModal: false,
        baselineIs3d: true,
        fallbackNon3dSlice: "image",
        is3dPinned: true,
        destinationHasCurrentModalSlice: null,
      })
    ).toBe("image");
  });

  it("preserves current modal slice when destination confirms it exists", () => {
    expect(
      resolveModalMain2dSlice({
        groupSlice: "pcd",
        currentModalSlice: "right",
        groupMediaTypes,
        hasExistingModal: true,
        baselineIs3d: true,
        fallbackNon3dSlice: "image",
        is3dPinned: true,
        destinationHasCurrentModalSlice: true,
      })
    ).toBe("right");
  });

  it("keeps pinned 3d baseline when destination does not have current slice", () => {
    expect(
      resolveModalMain2dSlice({
        groupSlice: "pcd",
        currentModalSlice: "right",
        groupMediaTypes,
        hasExistingModal: true,
        baselineIs3d: true,
        fallbackNon3dSlice: "image",
        is3dPinned: true,
        destinationHasCurrentModalSlice: false,
      })
    ).toBe("pcd");
  });

  it("falls back to deterministic non-3d slice when unpinned and destination misses current slice", () => {
    expect(
      resolveModalMain2dSlice({
        groupSlice: "pcd",
        currentModalSlice: "right",
        groupMediaTypes,
        hasExistingModal: true,
        baselineIs3d: true,
        fallbackNon3dSlice: "image",
        is3dPinned: false,
        destinationHasCurrentModalSlice: false,
      })
    ).toBe("image");
  });

  it("uses baseline slice when baseline is non-3d", () => {
    expect(
      resolveModalMain2dSlice({
        groupSlice: "right",
        currentModalSlice: "pcd",
        groupMediaTypes,
        hasExistingModal: true,
        baselineIs3d: false,
        fallbackNon3dSlice: "image",
        is3dPinned: true,
        destinationHasCurrentModalSlice: false,
      })
    ).toBe("right");
  });

  it("does not preserve unknown current modal slices", () => {
    expect(
      resolveModalMain2dSlice({
        groupSlice: "pcd",
        currentModalSlice: "missing-slice",
        groupMediaTypes,
        hasExistingModal: true,
        baselineIs3d: true,
        fallbackNon3dSlice: "image",
        is3dPinned: true,
        destinationHasCurrentModalSlice: true,
      })
    ).toBe("pcd");
  });

  it("falls back to the 3d baseline when the destination has no non-3d slice", () => {
    expect(
      resolveModalMain2dSlice({
        groupSlice: "pcd",
        currentModalSlice: "pcd",
        groupMediaTypes,
        hasExistingModal: false,
        baselineIs3d: true,
        fallbackNon3dSlice: "image",
        is3dPinned: true,
        destinationHasCurrentModalSlice: null,
      })
    ).toBe("image");

    expect(
      resolveModalMain2dSlice({
        groupSlice: "pcd",
        currentModalSlice: "pcd",
        groupMediaTypes: [{ name: "pcd", mediaType: "point-cloud" }],
        hasExistingModal: false,
        baselineIs3d: true,
        fallbackNon3dSlice: null,
        is3dPinned: true,
        destinationHasCurrentModalSlice: null,
      })
    ).toBe("pcd");
  });
});
