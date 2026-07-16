// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fetchMasks, type Masks } from "./protocol";
import { useMasks } from "./useMasks";

vi.mock("./protocol", () => ({ fetchMasks: vi.fn() }));

const masks = (partial: Partial<Masks>): Masks => ({
  visible: null,
  match: null,
  ...partial,
});

describe("useMasks", () => {
  it("passes early-out masks through as nulls", async () => {
    vi.mocked(fetchMasks).mockResolvedValue(masks({}));
    const { result } = renderHook(() => useMasks("ds", "viz", [], null, 4));

    await waitFor(() => expect(fetchMasks).toHaveBeenCalled());
    expect(result.current.visibleMask).toBeNull();
    expect(result.current.visibleCount).toBeNull();
  });

  it("slices the visible mask to the loaded prefix mid-load", async () => {
    vi.mocked(fetchMasks).mockResolvedValue(
      masks({ visible: new Uint8Array([1, 0, 1, 1]) }),
    );
    const { result, rerender } = renderHook(
      ({ count }: { count: number }) => useMasks("ds", "viz", [], null, count),
      { initialProps: { count: 2 } },
    );

    await waitFor(() => expect(result.current.visibleMask).not.toBeNull());
    // Wire order makes the prefix valid while chunks are still landing
    expect([...(result.current.visibleMask as Uint8Array)]).toEqual([1, 0]);
    // The count reflects the full mask, not the loaded prefix
    expect(result.current.visibleCount).toBe(3);

    rerender({ count: 4 });
    expect(result.current.visibleMask?.length).toBe(4);
  });

  // Sidebar filters scope the plot: the match mask hides non-matching
  // points rather than dimming them
  it("folds the filter match mask into visibility", async () => {
    vi.mocked(fetchMasks).mockResolvedValue(
      masks({
        visible: new Uint8Array([1, 1, 0, 1]),
        match: new Uint8Array([0, 1, 0, 1]),
      }),
    );
    const { result } = renderHook(() => useMasks("ds", "viz", [], null, 4));

    await waitFor(() => expect(result.current.visibleMask).not.toBeNull());
    expect([...(result.current.visibleMask as Uint8Array)]).toEqual([
      0, 1, 0, 1,
    ]);
    expect(result.current.visibleCount).toBe(2);
  });

  it("hides by the match mask alone when no view stages exist", async () => {
    vi.mocked(fetchMasks).mockResolvedValue(
      masks({ match: new Uint8Array([0, 1, 0, 1]) }),
    );
    const { result } = renderHook(() => useMasks("ds", "viz", [], null, 4));

    await waitFor(() => expect(result.current.visibleMask).not.toBeNull());
    expect([...(result.current.visibleMask as Uint8Array)]).toEqual([
      0, 1, 0, 1,
    ]);
  });

  // A client-computed filter mask (colorMask.ts) must scope the plot
  // without waiting on — or being overridden by — the server masks
  it("folds a local mask in with the server masks", async () => {
    vi.mocked(fetchMasks).mockResolvedValue(
      masks({ visible: new Uint8Array([1, 1, 1, 0]) }),
    );
    const local = new Uint8Array([1, 0, 1, 1]);
    const { result } = renderHook(() =>
      useMasks("ds", "viz", [], null, 4, local),
    );

    // Applies alone before the fetch resolves (the instant path) ...
    expect([...(result.current.visibleMask as Uint8Array)]).toEqual([
      1, 0, 1, 1,
    ]);
    // ... and composes once the server masks land
    await waitFor(() =>
      expect([...(result.current.visibleMask as Uint8Array)]).toEqual([
        1, 0, 1, 0,
      ]),
    );
    expect(result.current.visibleCount).toBe(2);
  });

  // A run switch changes the wire order itself; yesterday's mask must
  // not style today's points while the replacement is in flight
  it("drops masks the moment the run changes", async () => {
    vi.mocked(fetchMasks).mockResolvedValue(
      masks({ visible: new Uint8Array([1, 0, 1, 1]) }),
    );
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useMasks("ds", key, [], null, 4),
      { initialProps: { key: "viz" } },
    );
    await waitFor(() => expect(result.current.visibleMask).not.toBeNull());

    vi.mocked(fetchMasks).mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    rerender({ key: "viz2" });
    expect(result.current.visibleMask).toBeNull();
  });

  it("clears masks when no run is selected", async () => {
    vi.mocked(fetchMasks).mockClear();
    const { result } = renderHook(() => useMasks("ds", null, [], null, 0));

    expect(fetchMasks).not.toHaveBeenCalled();
    expect(result.current.visibleMask).toBeNull();
  });

  it("reports mask fetch failures", async () => {
    vi.mocked(fetchMasks).mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useMasks("ds", "viz", [], null, 0));

    await waitFor(() => expect(result.current.error).toMatch("boom"));
  });
});
