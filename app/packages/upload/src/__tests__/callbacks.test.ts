import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useFileUpload } from "../useFileUpload";
import {
  createFile,
  deferred,
  mockFetch,
  successResponse,
  setupFetchMock,
} from "./helpers";

setupFetchMock();

describe("lifecycle callbacks", () => {
  it("calls onFileSuccess after a successful upload", async () => {
    mockFetch.mockResolvedValueOnce(successResponse("/uploads/a.png"));
    const onFileSuccess = vi.fn();

    const { result } = renderHook(() => useFileUpload({ onFileSuccess }));

    act(() => {
      result.current.addFiles([createFile("a.png", 100, "image/png")]);
    });

    await act(async () => {
      await result.current.upload({ destination: "/uploads" });
    });

    expect(onFileSuccess).toHaveBeenCalledTimes(1);
    expect(onFileSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "a.png",
        status: "success",
        remotePath: "/uploads/a.png",
      })
    );
  });

  it("calls onFileError after a failed upload", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Network error"));
    const onFileError = vi.fn();

    const { result } = renderHook(() => useFileUpload({ onFileError }));

    act(() => {
      result.current.addFiles([createFile("a.png", 100, "image/png")]);
    });

    await act(async () => {
      await result.current.upload({ destination: "/uploads" });
    });

    expect(onFileError).toHaveBeenCalledTimes(1);
    expect(onFileError).toHaveBeenCalledWith(
      expect.objectContaining({ name: "a.png" }),
      "Network error"
    );
  });

  it("calls correct callback per file in a mixed batch", async () => {
    mockFetch
      .mockResolvedValueOnce(successResponse("/uploads/ok.png"))
      .mockRejectedValueOnce(new TypeError("fail"));

    const onFileSuccess = vi.fn();
    const onFileError = vi.fn();

    const { result } = renderHook(() =>
      useFileUpload({ multiple: true, onFileSuccess, onFileError })
    );

    act(() => {
      result.current.addFiles([
        createFile("ok.png", 100, "image/png"),
        createFile("fail.png", 100, "image/png"),
      ]);
    });

    await act(async () => {
      await result.current.upload({ destination: "/uploads" });
    });

    expect(onFileSuccess).toHaveBeenCalledTimes(1);
    expect(onFileSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ name: "ok.png", status: "success" })
    );
    expect(onFileError).toHaveBeenCalledTimes(1);
    expect(onFileError).toHaveBeenCalledWith(
      expect.objectContaining({ name: "fail.png" }),
      "fail"
    );
  });

  it("does not call onFileSuccess when upload is cancelled", async () => {
    const d = deferred<Response>();
    mockFetch.mockReturnValueOnce(d.promise);
    const onFileSuccess = vi.fn();

    const { result } = renderHook(() => useFileUpload({ onFileSuccess }));

    act(() => {
      result.current.addFiles([createFile("a.png", 100, "image/png")]);
    });

    let uploadPromise: Promise<void>;
    act(() => {
      uploadPromise = result.current.upload({ destination: "/uploads" });
    });

    const id = result.current.files[0].id;
    await act(async () => {
      await result.current.cancel(id);
    });

    d.resolve(successResponse("/uploads/a.png"));
    await act(async () => {
      await uploadPromise!;
    });

    expect(onFileSuccess).not.toHaveBeenCalled();
  });

  it("calls onFileSuccess for each file on retry", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("fail"));
    const onFileSuccess = vi.fn();
    const onFileError = vi.fn();

    const { result } = renderHook(() =>
      useFileUpload({ onFileSuccess, onFileError })
    );

    act(() => {
      result.current.addFiles([createFile("a.png", 100, "image/png")]);
    });

    await act(async () => {
      await result.current.upload({ destination: "/uploads" });
    });
    expect(onFileError).toHaveBeenCalledTimes(1);

    mockFetch.mockResolvedValueOnce(successResponse("/uploads/a.png"));

    await act(async () => {
      await result.current.retry(result.current.files[0].id);
    });

    expect(onFileSuccess).toHaveBeenCalledTimes(1);
  });
});
