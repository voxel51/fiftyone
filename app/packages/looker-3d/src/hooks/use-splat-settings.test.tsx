import { act, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { useSplatSettings } from "./use-splat-settings";

const STORAGE_KEY = "fo3d-splatSettings:v1";

const createWrapper = () => {
  const store = createStore();

  return ({ children }: { children?: ReactNode }) =>
    createElement(Provider, { store }, children);
};

afterEach(() => {
  localStorage.clear();
});

describe("useSplatSettings", () => {
  it("hydrates and normalizes stored settings on the initial render", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        detail: "ultra",
        sharpness: 50,
        sorting: "random",
        maxSh: 7,
      }),
    );

    const { result } = renderHook(() => useSplatSettings(), {
      wrapper: createWrapper(),
    });

    expect(result.current[0]).toEqual({
      detail: "low",
      sharpness: 2,
      sorting: "stable",
      maxSh: 0,
    });
  });

  it("normalizes functional updates before persisting them", () => {
    const { result } = renderHook(() => useSplatSettings(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current[1]((previous) => ({
        ...previous,
        detail: "high",
        sharpness: 1.6,
      }));
    });

    expect(result.current[0]).toEqual({
      detail: "high",
      sharpness: 1.6,
      sorting: "stable",
      maxSh: 0,
    });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toEqual(
      result.current[0],
    );
  });
});
