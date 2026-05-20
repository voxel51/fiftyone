/**
 * Copyright 2017-2026, Voxel51, Inc.
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react-hooks";
import { describe, expect, it, vi } from "vitest";

const mockSelectors = vi.hoisted(() => ({
  groupByFieldValue: { key: "groupByFieldValue" },
}));

const mockPathData = vi.hoisted(() => ({
  dynamicGroupsElementCount: ({
    modal,
    value,
  }: {
    modal: boolean;
    value: string | null;
  }) => ({ key: `dynamicGroupsElementCount-${modal}-${value}` }),
}));

const stateStore = vi.hoisted(() => ({
  loadables: {} as Record<string, { state: string; contents: unknown }>,
}));

vi.mock("../../recoil/dynamicGroups", () => mockSelectors);
vi.mock("../../recoil/pathData/groups", () => mockPathData);

vi.mock("recoil", async () => {
  const actual = await vi.importActual<typeof import("recoil")>("recoil");
  return {
    ...actual,
    useRecoilValueLoadable: (node: { key: string }) =>
      stateStore.loadables[node.key] ?? { state: "loading" },
  };
});

import { useElementsCount, useGroupByFieldValue } from "./dynamicGroups";

describe("useGroupByFieldValue", () => {
  it("returns undefined before the first value settles", () => {
    stateStore.loadables = {};
    const { result } = renderHook(() => useGroupByFieldValue());
    expect(result.current).toBeUndefined();
  });

  it("returns the settled value", () => {
    stateStore.loadables = {
      groupByFieldValue: { state: "hasValue", contents: "cat" },
    };
    const { result } = renderHook(() => useGroupByFieldValue());
    expect(result.current).toBe("cat");
  });

  it("returns null when the group field is absent", () => {
    stateStore.loadables = {
      groupByFieldValue: { state: "hasValue", contents: null },
    };
    const { result } = renderHook(() => useGroupByFieldValue());
    expect(result.current).toBeNull();
  });

  it("holds the last settled value while the next value is loading", () => {
    stateStore.loadables = {
      groupByFieldValue: { state: "hasValue", contents: "cat" },
    };
    const { result, rerender } = renderHook(() => useGroupByFieldValue());
    expect(result.current).toBe("cat");

    stateStore.loadables = {};
    rerender();

    expect(result.current).toBe("cat");
  });

  it("updates once a new value settles after a loading transition", () => {
    stateStore.loadables = {
      groupByFieldValue: { state: "hasValue", contents: "cat" },
    };
    const { result, rerender } = renderHook(() => useGroupByFieldValue());

    stateStore.loadables = {};
    rerender();
    expect(result.current).toBe("cat");

    stateStore.loadables = {
      groupByFieldValue: { state: "hasValue", contents: "dog" },
    };
    rerender();
    expect(result.current).toBe("dog");
  });

  it("surfaces errors from the selector as a render error", () => {
    stateStore.loadables = {
      groupByFieldValue: {
        state: "hasError",
        contents: new Error("fetch failed"),
      },
    };
    const { result } = renderHook(() => useGroupByFieldValue());
    expect(result.error).toEqual(new Error("fetch failed"));
  });
});

describe("useElementsCount", () => {
  it("surfaces errors from the count selector as a render error", () => {
    stateStore.loadables = {
      groupByFieldValue: { state: "hasValue", contents: "cat" },
      "dynamicGroupsElementCount-true-cat": {
        state: "hasError",
        contents: new Error("count failed"),
      },
    };
    const { result } = renderHook(() => useElementsCount(true));
    expect(result.error).toEqual(new Error("count failed"));
  });

  it("returns 0 before the count settles", () => {
    stateStore.loadables = {
      groupByFieldValue: { state: "hasValue", contents: "cat" },
    };
    const { result } = renderHook(() => useElementsCount(true));
    expect(result.current).toBe(0);
  });

  it("returns the settled element count", () => {
    stateStore.loadables = {
      groupByFieldValue: { state: "hasValue", contents: "cat" },
      "dynamicGroupsElementCount-true-cat": {
        state: "hasValue",
        contents: 42,
      },
    };
    const { result } = renderHook(() => useElementsCount(true));
    expect(result.current).toBe(42);
  });

  it("holds the last count while groupByFieldValue transitions between groups", () => {
    stateStore.loadables = {
      groupByFieldValue: { state: "hasValue", contents: "cat" },
      "dynamicGroupsElementCount-true-cat": {
        state: "hasValue",
        contents: 42,
      },
    };
    const { result, rerender } = renderHook(() => useElementsCount(true));
    expect(result.current).toBe(42);

    // group key transitions — both selectors go back to loading
    stateStore.loadables = {};
    rerender();

    expect(result.current).toBe(42);
  });

  it("updates the count once the new group's count settles", () => {
    stateStore.loadables = {
      groupByFieldValue: { state: "hasValue", contents: "cat" },
      "dynamicGroupsElementCount-true-cat": {
        state: "hasValue",
        contents: 42,
      },
    };
    const { result, rerender } = renderHook(() => useElementsCount(true));

    stateStore.loadables = {};
    rerender();

    stateStore.loadables = {
      groupByFieldValue: { state: "hasValue", contents: "dog" },
      "dynamicGroupsElementCount-true-dog": {
        state: "hasValue",
        contents: 7,
      },
    };
    rerender();

    expect(result.current).toBe(7);
  });

  it("respects the modal flag when keying the count selector", () => {
    stateStore.loadables = {
      groupByFieldValue: { state: "hasValue", contents: "cat" },
      "dynamicGroupsElementCount-false-cat": {
        state: "hasValue",
        contents: 99,
      },
    };
    const { result } = renderHook(() => useElementsCount(false));
    expect(result.current).toBe(99);
  });
});
