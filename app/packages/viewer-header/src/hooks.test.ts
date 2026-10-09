import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCopySampleLink, useViewerSample } from "./hooks";

const harness = vi.hoisted(() => ({
  selector: null as Record<string, unknown> | null,
  slice: null as string | null,
  position: null as { index: number; total: number | null } | null,
  setConfig: vi.fn(),
}));

vi.mock("@fiftyone/state", () => ({
  useActivityToast: () => ({ setConfig: harness.setConfig }),
  useModalGroupSlice: () => harness.slice,
  useModalPosition: () => harness.position,
  useModalSelector: () => harness.selector,
}));

afterEach(() => {
  harness.selector = null;
  harness.slice = null;
  harness.position = null;
  vi.clearAllMocks();
});

describe("useViewerSample", () => {
  it("names an ungrouped sample by its id, with no slice", () => {
    harness.selector = { id: "s1", hasNext: true };
    harness.slice = "left";

    const { result } = renderHook(() => useViewerSample());

    expect(result.current).toEqual({
      id: "s1",
      slice: null,
      hasNext: true,
      hasPrevious: false,
      position: null,
    });
  });

  it("names a grouped sample by its group, with its slice", () => {
    harness.selector = { id: "s1", groupId: "g1", hasPrevious: true };
    harness.slice = "left";
    harness.position = { index: 3, total: 40 };

    const { result } = renderHook(() => useViewerSample());

    expect(result.current).toEqual({
      id: "g1",
      slice: "left",
      hasNext: false,
      hasPrevious: true,
      position: { index: 3, total: 40 },
    });
  });
});

describe("useCopySampleLink", () => {
  const clipboard = (writeText: (text: string) => Promise<void>) =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

  it("copies the page's URL and says so", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    clipboard(writeText);
    const { result } = renderHook(() => useCopySampleLink());

    await act(() => result.current());

    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(harness.setConfig).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Link copied", variant: "success" }),
    );
  });

  it("says when the clipboard refuses", async () => {
    clipboard(() => Promise.reject(new Error("denied")));
    const { result } = renderHook(() => useCopySampleLink());

    await act(() => result.current());

    expect(harness.setConfig).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "danger" }),
    );
  });
});
