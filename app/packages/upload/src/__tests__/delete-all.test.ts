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

describe("deleteAll", () => {
  it("clears all files and resets to empty state", async () => {
    const { result } = renderHook(() => useFileUpload({ multiple: true }));

    act(() => {
      result.current.addFiles([
        createFile("a.png", 100, "image/png"),
        createFile("b.png", 200, "image/png"),
      ]);
    });

    await act(async () => {
      await result.current.deleteAll();
    });

    expect(result.current.files).toEqual([]);
    expect(result.current.totalFiles).toBe(0);
    expect(result.current.isUploading).toBe(false);
  });

  it("sends DELETE for every uploaded file", async () => {
    mockFetch
      .mockResolvedValueOnce(successResponse("/uploads/a.png"))
      .mockResolvedValueOnce(successResponse("/uploads/b.png"));

    const { result } = renderHook(() => useFileUpload({ multiple: true }));

    act(() => {
      result.current.addFiles([
        createFile("a.png", 100, "image/png"),
        createFile("b.png", 200, "image/png"),
      ]);
    });

    await act(async () => {
      await result.current.upload({ destination: "/uploads" });
    });

    expect(result.current.completedFiles).toBe(2);

    mockFetch.mockClear();
    mockFetch.mockResolvedValue(new Response(null, { status: 204 }));

    await act(async () => {
      await result.current.deleteAll();
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    for (const [, options] of mockFetch.mock.calls) {
      expect(options.method).toBe("DELETE");
    }
    expect(result.current.files).toEqual([]);
  });

  it("aborts in-flight uploads and deletes completed ones", async () => {
    const d = deferred<Response>();

    mockFetch
      .mockResolvedValueOnce(successResponse("/uploads/done.png"))
      .mockReturnValueOnce(d.promise);

    const { result } = renderHook(() => useFileUpload({ multiple: true }));

    act(() => {
      result.current.addFiles([
        createFile("done.png", 100, "image/png"),
        createFile("pending.png", 200, "image/png"),
      ]);
    });

    let uploadPromise: Promise<void>;
    act(() => {
      uploadPromise = result.current.upload({ destination: "/uploads" });
    });

    mockFetch.mockResolvedValue(new Response(null, { status: 204 }));

    await act(async () => {
      await result.current.deleteAll();
    });

    expect(result.current.files).toEqual([]);
    expect(result.current.isUploading).toBe(false);

    d.resolve(successResponse("/uploads/pending.png"));
    await act(async () => {
      await uploadPromise;
    });
  });

  it("continues deleting even if one DELETE request fails", async () => {
    mockFetch
      .mockResolvedValueOnce(successResponse("/uploads/a.png"))
      .mockResolvedValueOnce(successResponse("/uploads/b.png"))
      .mockResolvedValueOnce(successResponse("/uploads/c.png"));

    const { result } = renderHook(() => useFileUpload({ multiple: true }));

    act(() => {
      result.current.addFiles([
        createFile("a.png", 100, "image/png"),
        createFile("b.png", 200, "image/png"),
        createFile("c.png", 300, "image/png"),
      ]);
    });

    await act(async () => {
      await result.current.upload({ destination: "/uploads" });
    });

    mockFetch.mockClear();
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockRejectedValueOnce(new TypeError("network error"))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await act(async () => {
      await result.current.deleteAll();
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result.current.files).toEqual([]);
  });

  it("handles mixed states: selected, uploaded, errored", async () => {
    mockFetch
      .mockResolvedValueOnce(successResponse("/uploads/ok.png"))
      .mockRejectedValueOnce(new TypeError("fail"));

    const { result } = renderHook(() => useFileUpload({ multiple: true }));

    act(() => {
      result.current.addFiles([
        createFile("ok.png", 100, "image/png"),
        createFile("fail.png", 100, "image/png"),
      ]);
    });

    await act(async () => {
      await result.current.upload({ destination: "/uploads" });
    });

    act(() => {
      result.current.addFiles([createFile("new.png", 100, "image/png")]);
    });

    expect(result.current.files).toHaveLength(3);

    mockFetch.mockClear();
    mockFetch.mockResolvedValue(new Response(null, { status: 204 }));

    await act(async () => {
      await result.current.deleteAll();
    });

    // Only the successfully uploaded file should trigger a DELETE
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.files).toEqual([]);
  });

  it("does nothing when there are no files", async () => {
    const { result } = renderHook(() => useFileUpload({ multiple: true }));

    await act(async () => {
      await result.current.deleteAll();
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.files).toEqual([]);
  });
});
