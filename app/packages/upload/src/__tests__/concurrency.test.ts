import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useFileUpload } from "../useFileUpload";
import {
  createFile,
  deferred,
  mockFetch,
  successResponse,
  setupFetchMock,
} from "./helpers";

setupFetchMock();

describe("upload — concurrency", () => {
  it("limits concurrent uploads to maxConcurrent", async () => {
    const d1 = deferred<Response>();
    const d2 = deferred<Response>();
    const d3 = deferred<Response>();

    mockFetch
      .mockReturnValueOnce(d1.promise)
      .mockReturnValueOnce(d2.promise)
      .mockReturnValueOnce(d3.promise);

    const { result } = renderHook(() =>
      useFileUpload({ multiple: true, maxConcurrent: 2 })
    );

    act(() => {
      result.current.addFiles([
        createFile("a.png", 100, "image/png"),
        createFile("b.png", 100, "image/png"),
        createFile("c.png", 100, "image/png"),
      ]);
    });

    let uploadPromise: Promise<void>;
    act(() => {
      uploadPromise = result.current.upload({ destination: "/uploads" });
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);

    await act(async () => {
      d1.resolve(successResponse("/uploads/a.png"));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);

    d2.resolve(successResponse("/uploads/b.png"));
    d3.resolve(successResponse("/uploads/c.png"));
    await act(async () => {
      await uploadPromise!;
    });

    expect(result.current.completedFiles).toBe(3);
  });

  it("uploads all at once when maxConcurrent is not set", async () => {
    mockFetch
      .mockResolvedValueOnce(successResponse("/uploads/a.png"))
      .mockResolvedValueOnce(successResponse("/uploads/b.png"))
      .mockResolvedValueOnce(successResponse("/uploads/c.png"));

    const { result } = renderHook(() => useFileUpload({ multiple: true }));

    act(() => {
      result.current.addFiles([
        createFile("a.png", 100, "image/png"),
        createFile("b.png", 100, "image/png"),
        createFile("c.png", 100, "image/png"),
      ]);
    });

    await act(async () => {
      await result.current.upload({ destination: "/uploads" });
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result.current.completedFiles).toBe(3);
  });

  it("respects maxConcurrent of 1 for sequential uploads", async () => {
    const deferreds = [deferred<Response>(), deferred<Response>()];
    let callIndex = 0;

    mockFetch.mockImplementation(() => deferreds[callIndex++].promise);

    const { result } = renderHook(() =>
      useFileUpload({ multiple: true, maxConcurrent: 1 })
    );

    act(() => {
      result.current.addFiles([
        createFile("a.png", 100, "image/png"),
        createFile("b.png", 100, "image/png"),
      ]);
    });

    let uploadPromise: Promise<void>;
    act(() => {
      uploadPromise = result.current.upload({ destination: "/uploads" });
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferreds[0].resolve(successResponse("/uploads/a.png"));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);

    deferreds[1].resolve(successResponse("/uploads/b.png"));
    await act(async () => {
      await uploadPromise!;
    });

    expect(result.current.completedFiles).toBe(2);
  });
});
