import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlySplatDetection } from "./Ply";

const mocks = vi.hoisted(() => ({
  sniffPlyIsGaussianSplat: vi.fn(),
}));

vi.mock("./ply-splat-detection", () => ({
  sniffPlyIsGaussianSplat: mocks.sniffPlyIsGaussianSplat,
}));

const buildLoadingManager = () => ({
  itemEnd: vi.fn(),
  itemError: vi.fn(),
  itemStart: vi.fn(),
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("usePlySplatDetection", () => {
  it.each([true, false])(
    "reports a resolved %s classification",
    async (result) => {
      mocks.sniffPlyIsGaussianSplat.mockResolvedValue(result);
      const loadingManager = buildLoadingManager();
      const { result: hookResult } = renderHook(() =>
        usePlySplatDetection("scene.ply", loadingManager),
      );

      expect(hookResult.current).toBeNull();
      await waitFor(() =>
        expect(hookResult.current).toEqual({
          isGaussianSplat: result,
          plyUrl: "scene.ply",
        }),
      );
      expect(loadingManager.itemStart).toHaveBeenCalledWith(
        "scene.ply#ply-splat-header",
      );
      expect(loadingManager.itemEnd).toHaveBeenCalledWith(
        "scene.ply#ply-splat-header",
      );
      expect(loadingManager.itemError).not.toHaveBeenCalled();
    },
  );

  it("falls back to ordinary PLY rendering when classification fails", async () => {
    mocks.sniffPlyIsGaussianSplat.mockRejectedValue(
      new Error("header request failed"),
    );
    const loadingManager = buildLoadingManager();
    const { result } = renderHook(() =>
      usePlySplatDetection("broken.ply", loadingManager),
    );

    await waitFor(() =>
      expect(result.current).toEqual({
        isGaussianSplat: false,
        plyUrl: "broken.ply",
      }),
    );
    expect(loadingManager.itemError).not.toHaveBeenCalled();
    expect(loadingManager.itemEnd).toHaveBeenCalledWith(
      "broken.ply#ply-splat-header",
    );
  });

  it("aborts stale requests and ignores their results", async () => {
    const oldRequest = deferred<boolean>();
    const newRequest = deferred<boolean>();
    const signals: AbortSignal[] = [];
    mocks.sniffPlyIsGaussianSplat.mockImplementation(
      (url: string, signal: AbortSignal) => {
        signals.push(signal);
        return url === "old.ply" ? oldRequest.promise : newRequest.promise;
      },
    );
    const loadingManager = buildLoadingManager();
    const { result, rerender } = renderHook(
      ({ url }) => usePlySplatDetection(url, loadingManager),
      { initialProps: { url: "old.ply" } },
    );

    rerender({ url: "new.ply" });
    expect(signals[0].aborted).toBe(true);

    await act(async () => oldRequest.resolve(true));
    expect(result.current).toBeNull();

    await act(async () => newRequest.resolve(false));
    expect(result.current).toEqual({
      isGaussianSplat: false,
      plyUrl: "new.ply",
    });
    expect(loadingManager.itemEnd).toHaveBeenCalledTimes(2);
  });
});
