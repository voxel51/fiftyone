import type { SelectionRequest } from "@fiftyone/state/src/selection";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import useGridJump, {
  type PreparedGridLocation,
  type RevealGrid,
} from "./useGridJump";

const highlight = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("./gridTileRegistry", () => ({ highlightRevealedTile: highlight }));
const request: SelectionRequest = {
  view: [],
  filters: {},
  extendedStages: {},
  boundary: {},
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup() {
  const prepare =
    vi.fn<
      (
        ...args: [string, SelectionRequest, string, AbortSignal]
      ) => Promise<PreparedGridLocation | null>
    >();
  const anchor = vi.fn();
  const grid = { revealItem: vi.fn(async () => false) };
  const props = {
    scopeKey: "view",
    datasetId: "dataset",
    request,
    prepare,
    anchor,
    spotlight: grid as RevealGrid,
  };
  const hook = renderHook((props) => useGridJump(props), {
    initialProps: props,
  });
  return { ...hook, props, grid, prepare, anchor };
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("show in grid", () => {
  it("reveals and highlights retained items without fetching", async () => {
    const { result, grid, prepare } = setup();
    grid.revealItem.mockResolvedValue(true);
    expect(await result.current("loaded")).toBe(true);
    expect(prepare).not.toHaveBeenCalled();
    expect(highlight).toHaveBeenCalledWith("loaded", expect.any(AbortSignal));
  });

  it("keeps loading until the replacement grid has rendered", async () => {
    const { result, props, prepare, anchor, rerender } = setup();
    const commit = vi.fn();
    prepare.mockResolvedValue({ page: 0, commit });
    let settled = false;
    const pending = result.current("destination").then((value) => {
      settled = true;
      return value;
    });
    await vi.waitFor(() =>
      expect(anchor).toHaveBeenCalledWith({ page: 0, at: "destination" }),
    );
    expect(commit).toHaveBeenCalledOnce();
    expect(settled).toBe(false);
    const rendered = deferred<boolean>();
    const replacement = { revealItem: vi.fn(() => rendered.promise) };
    rerender({ ...props, spotlight: replacement });
    expect(settled).toBe(false);
    rendered.resolve(true);
    expect(await pending).toBe(true);
    expect(highlight).toHaveBeenCalledWith(
      "destination",
      expect.any(AbortSignal),
    );
  });

  it("aborts an older lookup and never commits it even if its transport ignores abort", async () => {
    const { result, prepare, anchor, grid } = setup();
    const old = deferred<PreparedGridLocation>();
    const commit = vi.fn();
    prepare.mockReturnValue(old.promise);
    const first = result.current("first");
    const rejected = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledOnce());
    const signal = prepare.mock.calls[0][3];
    grid.revealItem.mockResolvedValue(true);
    expect(await result.current("second")).toBe(true);
    await rejected;
    expect(signal.aborted).toBe(true);
    old.resolve({ page: 17, commit });
    await Promise.resolve();
    expect(commit).not.toHaveBeenCalled();
    expect(anchor).not.toHaveBeenCalled();
    expect(highlight).toHaveBeenCalledTimes(1);
  });

  it("retires a pending landing when a newer click arrives", async () => {
    const { result, prepare, anchor, props, rerender } = setup();
    prepare.mockResolvedValue({ page: 0, commit: vi.fn() });
    const first = result.current("first");
    const rejected = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(anchor).toHaveBeenCalledOnce());
    const second = result.current("second");
    rerender({ ...props, spotlight: { revealItem: vi.fn(async () => true) } });
    expect(await second).toBe(true);
    await rejected;
    expect(highlight).toHaveBeenCalledTimes(1);
    expect(highlight).toHaveBeenCalledWith("second", expect.any(AbortSignal));
  });

  it.each(["cancel", "view", "unmount"])(
    "cancels on %s without reporting a missing sample",
    async (reason) => {
      const { result, prepare, props, rerender, unmount, anchor } = setup();
      const lookup = deferred<PreparedGridLocation>();
      prepare.mockReturnValue(lookup.promise);
      const controller = new AbortController();
      const pending = result.current("sample", controller.signal);
      const rejected = expect(pending).rejects.toMatchObject({
        name: "AbortError",
      });
      await vi.waitFor(() => expect(prepare).toHaveBeenCalledOnce());
      if (reason === "cancel") controller.abort();
      if (reason === "view") rerender({ ...props, scopeKey: "other" });
      if (reason === "unmount") unmount();
      await rejected;
      expect(prepare.mock.calls[0][3].aborted).toBe(true);
      expect(anchor).not.toHaveBeenCalled();
    },
  );

  it("distinguishes missing samples from retryable failures", async () => {
    const { result, prepare, anchor } = setup();
    prepare.mockResolvedValueOnce(null);
    expect(await result.current("missing")).toBe(false);
    prepare.mockRejectedValueOnce(new Error("network"));
    await expect(result.current("retry")).rejects.toThrow("network");
    expect(anchor).not.toHaveBeenCalled();
  });

  it("times out a stalled lookup and retires its transport", async () => {
    vi.useFakeTimers();
    try {
      const { result, prepare, anchor } = setup();
      prepare.mockReturnValue(deferred<PreparedGridLocation>().promise);
      const pending = result.current("stalled");
      const rejected = expect(pending).rejects.toMatchObject({
        name: "TimeoutError",
      });
      await vi.advanceTimersByTimeAsync(15_000);
      await rejected;
      expect(prepare.mock.calls[0][3].aborted).toBe(true);
      expect(anchor).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
