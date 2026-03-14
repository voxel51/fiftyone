import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useFileUpload } from "../useFileUpload";
import {
  createFile,
  deferred,
  errorResponse,
  mockFetch,
  successResponse,
  setupFetchMock,
} from "./helpers";

setupFetchMock();

describe("upload — failure", () => {
  it("sets status to error on a non-201 response", async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse(403, "FEATURE_DISABLED", "File operations disabled")
    );

    const { result } = renderHook(() => useFileUpload());

    act(() => {
      result.current.addFiles([createFile("a.png", 100, "image/png")]);
    });

    await act(async () => {
      await result.current.upload({ destination: "/uploads" });
    });

    expect(result.current.files[0].status).toBe("error");
    expect(result.current.files[0].error).toBeTruthy();
  });

  it("sets status to error on a network failure", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useFileUpload());

    act(() => {
      result.current.addFiles([createFile("a.png", 100, "image/png")]);
    });

    await act(async () => {
      await result.current.upload({ destination: "/uploads" });
    });

    expect(result.current.files[0].status).toBe("error");
    expect(result.current.files[0].error).toBeTruthy();
  });

  it("does not reject the upload promise when individual files fail", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useFileUpload());

    act(() => {
      result.current.addFiles([createFile("a.png", 100, "image/png")]);
    });

    await act(async () => {
      await result.current.upload({ destination: "/uploads" });
    });

    expect(result.current.failedFiles).toBe(1);
  });

  it("handles mixed success and failure", async () => {
    mockFetch
      .mockResolvedValueOnce(successResponse("/uploads/ok.png"))
      .mockRejectedValueOnce(new TypeError("Network error"));

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

    expect(result.current.completedFiles).toBe(1);
    expect(result.current.failedFiles).toBe(1);
  });
});

describe("upload — aggregate state", () => {
  it("isUploading is true while uploads are in flight", async () => {
    const d = deferred<Response>();
    mockFetch.mockReturnValueOnce(d.promise);

    const { result } = renderHook(() => useFileUpload());

    act(() => {
      result.current.addFiles([createFile("a.png", 100, "image/png")]);
    });

    let uploadPromise: Promise<void>;
    act(() => {
      uploadPromise = result.current.upload({ destination: "/uploads" });
    });

    expect(result.current.isUploading).toBe(true);

    d.resolve(successResponse("/uploads/a.png"));
    await act(async () => {
      await uploadPromise;
    });

    expect(result.current.isUploading).toBe(false);
  });

  it("isUploading is false after all uploads settle", async () => {
    mockFetch
      .mockResolvedValueOnce(successResponse("/uploads/a.png"))
      .mockRejectedValueOnce(new TypeError("fail"));

    const { result } = renderHook(() => useFileUpload({ multiple: true }));

    act(() => {
      result.current.addFiles([
        createFile("a.png", 100, "image/png"),
        createFile("b.png", 100, "image/png"),
      ]);
    });

    await act(async () => {
      await result.current.upload({ destination: "/uploads" });
    });

    expect(result.current.isUploading).toBe(false);
  });
});
