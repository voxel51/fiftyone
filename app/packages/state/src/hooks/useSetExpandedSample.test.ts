import { renderHook } from "@testing-library/react-hooks";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useSetExpandedSample from "./useSetExpandedSample";

const mockDynamicGroupAtoms = vi.hoisted(() => ({
  dynamicGroupIndex: { key: "dynamicGroupIndex" },
  dynamicGroupCurrentElementIndex: {
    key: "dynamicGroupCurrentElementIndex",
  },
}));

const mockGroupAtoms = vi.hoisted(() => ({
  groupSlice: { key: "groupSlice" },
  modalGroupSlice: { key: "modalGroupSlice" },
  groupMediaTypesMap: { key: "groupMediaTypesMap" },
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
    groupMediaTypesMap: {
      image: "image",
      pcd: "point-cloud",
      ply: "3d",
      right: "image",
    },
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

    await result.current({ id: "next-id", groupId: "next-group-id" });

    expect(stateStore.values.modalGroupSlice).toBe("ply");
    expect(stateStore.values.modalSelector).toEqual({
      id: "next-id",
      groupId: "next-group-id",
    });
  });

  it("prefers a deterministic 2d slice when opening from a 3d grid slice", async () => {
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

  it("does not overwrite a sparse-group fallback with a missing pinned slice", async () => {
    setState({
      modalGroupSlice: "right",
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

  it("falls back to a deterministic 2d slice when the missing sparse slice is unpinned", async () => {
    mockRenderConfig3d.getIsPinned.mockResolvedValue(false);
    setState({
      modalGroupSlice: "right",
      groupHasSampleOnSlice: () => false,
    });

    const { result } = renderHook(() => useSetExpandedSample());

    await result.current({ id: "next-id", groupId: "next-group-id" });

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

    await result.current({ id: "next-id", groupId: "next-group-id" });

    expect(stateStore.values.modalGroupSlice).toBe("right");
    expect(stateStore.values.modalSelector).toEqual({
      id: "next-id",
      groupId: "next-group-id",
    });
  });
});
