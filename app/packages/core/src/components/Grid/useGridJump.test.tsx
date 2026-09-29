import type { SelectionRequest } from "@fiftyone/state/src/selection";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import useGridJump from "./useGridJump";

const client = vi.hoisted(() => ({
  resolveSamplePosition:
    vi.fn<(...args: unknown[]) => Promise<{ index: number | null }>>(),
}));
vi.mock("@fiftyone/state/src/selection/client", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resolveSamplePosition: client.resolveSamplePosition,
}));

const request: SelectionRequest = {
  view: [],
  filters: {},
  extendedStages: {},
  boundary: {},
};
const anchor = vi.fn();

function useHarness(records: Map<string, number>) {
  return useGridJump({ records, datasetId: "dataset", request, anchor });
}

afterEach(() => {
  cleanup();
  anchor.mockReset();
  client.resolveSamplePosition.mockReset();
});

describe("useGridJump", () => {
  it("anchors the grid on a page from a known index without the server", async () => {
    const { result } = renderHook(() => useHarness(new Map([["seen", 47]])));
    expect(await result.current("seen")).toBe(true);
    expect(client.resolveSamplePosition).not.toHaveBeenCalled();
    expect(anchor).toHaveBeenCalledWith({ page: 2, at: "seen" });
  });

  it("asks the server for unseen samples and refuses ones the results omit", async () => {
    const { result } = renderHook(() => useHarness(new Map()));
    client.resolveSamplePosition.mockResolvedValueOnce({ index: 205 });
    expect(await result.current("unseen")).toBe(true);
    expect(client.resolveSamplePosition).toHaveBeenCalledWith("dataset", {
      ...request,
      sampleId: "unseen",
    });
    expect(anchor).toHaveBeenCalledWith({ page: 10, at: "unseen" });
    client.resolveSamplePosition.mockResolvedValueOnce({ index: null });
    expect(await result.current("gone")).toBe(false);
    expect(anchor).toHaveBeenCalledTimes(1);
  });

  it("drops a lookup that finishes after the view changed", async () => {
    let resolve: (value: { index: number | null }) => void = () => undefined;
    client.resolveSamplePosition.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { result, rerender } = renderHook(
      ({ records }: { records: Map<string, number> }) => useHarness(records),
      { initialProps: { records: new Map() } },
    );
    const pending = result.current("late");
    rerender({ records: new Map() });
    resolve({ index: 3 });
    expect(await pending).toBe(false);
    expect(anchor).not.toHaveBeenCalled();
  });
});
