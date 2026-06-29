/**
 * Copyright 2017-2026, Voxel51, Inc.
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react-hooks";
import { describe, expect, it, vi } from "vitest";

const mockSelectors = vi.hoisted(() => ({
  activeModalSidebarSample: { key: "activeModalSidebarSample" },
}));

const mockSchema = vi.hoisted(() => ({
  field: (path: string) => ({ key: `field-${path}` }),
  isOfDocumentFieldList: (path: string) => ({
    key: `isOfDocumentFieldList-${path}`,
  }),
}));

const mockSidebar = vi.hoisted(() => ({
  pullSidebarValue: vi.fn(
    (_field: unknown, keys: string[], contents: unknown, _isList: unknown) =>
      // Default behavior — drill into the sample via the keys array. Tests can
      // override the implementation if they need to assert call args directly.
      keys.reduce<unknown>(
        (acc, key) => (acc as Record<string, unknown> | undefined)?.[key],
        contents,
      ),
  ),
}));

const mockErrors = vi.hoisted(() => {
  class SampleNotFound extends Error {}
  class GroupSampleNotFound extends SampleNotFound {}
  return { SampleNotFound, GroupSampleNotFound };
});

const stateStore = vi.hoisted(() => ({
  loadables: {} as Record<string, { state: string; contents: unknown }>,
  values: {} as Record<string, unknown>,
}));

vi.mock("../../recoil/groups", () => mockSelectors);
vi.mock("../../recoil/schema", () => mockSchema);
vi.mock("../../recoil/sidebar", () => mockSidebar);
vi.mock("../../recoil/modal", () => mockErrors);

vi.mock("../../recoil/utils", async () => {
  const actual =
    await vi.importActual<typeof import("../../recoil/utils")>(
      "../../recoil/utils",
    );
  return {
    ...actual,
    useAssertedRecoilValue: (node: { key: string }) =>
      stateStore.values[node.key] ?? { __asserted: node.key },
  };
});

vi.mock("recoil", async () => {
  const actual = await vi.importActual<typeof import("recoil")>("recoil");
  return {
    ...actual,
    useRecoilValueLoadable: (node: { key: string }) =>
      stateStore.loadables[node.key] ?? { state: "loading" },
    useRecoilValue: (node: { key: string }) => stateStore.values[node.key],
  };
});

import {
  LOADING,
  useActiveModalSampleValue,
} from "./use-active-modal-sample-value";

const setSample = (
  loadable:
    | { state: "hasValue"; contents: unknown }
    | { state: "hasError"; contents: unknown }
    | { state: "loading" },
) => {
  stateStore.loadables.activeModalSidebarSample = loadable;
};

describe("useActiveModalSampleValue", () => {
  it("returns LOADING while the underlying sample is loading", () => {
    setSample({ state: "loading" });
    const { result } = renderHook(() =>
      useActiveModalSampleValue<string>("foo"),
    );
    expect(result.current).toBe(LOADING);
  });

  it("returns the resolved field value when the sample has loaded", () => {
    setSample({
      state: "hasValue",
      contents: { foo: { bar: "baz" } },
    });
    const { result } = renderHook(() =>
      useActiveModalSampleValue<string>("foo.bar"),
    );
    expect(result.current).toBe("baz");
  });

  it("treats GroupSampleNotFound as LOADING (sparse groups)", () => {
    setSample({
      state: "hasError",
      contents: new mockErrors.GroupSampleNotFound(),
    });
    const { result } = renderHook(() =>
      useActiveModalSampleValue<string>("foo"),
    );
    expect(result.current).toBe(LOADING);
  });

  it("rethrows plain SampleNotFound (does not swallow it)", () => {
    const err = new mockErrors.SampleNotFound("missing");
    setSample({ state: "hasError", contents: err });
    const { result } = renderHook(() =>
      useActiveModalSampleValue<string>("foo"),
    );
    expect(result.error).toBe(err);
  });

  it("rethrows arbitrary errors", () => {
    const err = new TypeError("boom");
    setSample({ state: "hasError", contents: err });
    const { result } = renderHook(() =>
      useActiveModalSampleValue<string>("foo"),
    );
    expect(result.error).toBe(err);
  });

  it("calls pullSidebarValue with the split keys and isList flag", () => {
    setSample({
      state: "hasValue",
      contents: { foo: { bar: 42 } },
    });
    stateStore.values["isOfDocumentFieldList-foo.bar"] = true;
    mockSidebar.pullSidebarValue.mockImplementationOnce(
      (_field, keys, contents, isList) => ({ keys, contents, isList }),
    );

    const { result } = renderHook(() => useActiveModalSampleValue("foo.bar"));
    expect(result.current).toEqual({
      keys: ["foo", "bar"],
      contents: { foo: { bar: 42 } },
      isList: true,
    });
  });
});
