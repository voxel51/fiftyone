import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useFileUpload } from "../useFileUpload";
import {
  createFile,
  mockFetch,
  successResponse,
  setupFetchMock,
} from "./helpers";

setupFetchMock();

describe("upload — success", () => {
  it("transitions files from selected to success", async () => {
    mockFetch.mockResolvedValueOnce(successResponse("/uploads/photo.png"));

    const { result } = renderHook(() => useFileUpload());

    act(() => {
      result.current.addFiles([createFile("photo.png", 100, "image/png")]);
    });

    await act(async () => {
      await result.current.upload({ destination: "/uploads" });
    });

    expect(result.current.files[0].status).toBe("success");
    expect(result.current.files[0].progress).toBe(100);
  });

  it("sets remotePath from the server response", async () => {
    mockFetch.mockResolvedValueOnce(
      successResponse("s3://bucket/images/photo.png")
    );

    const { result } = renderHook(() => useFileUpload());

    act(() => {
      result.current.addFiles([createFile("photo.png", 100, "image/png")]);
    });

    await act(async () => {
      await result.current.upload({ destination: "s3://bucket/images" });
    });

    expect(result.current.files[0].remotePath).toBe(
      "s3://bucket/images/photo.png"
    );
  });

  it("sends a POST with the resolved path as a query parameter", async () => {
    mockFetch.mockResolvedValueOnce(successResponse("/data/uploads/file.png"));

    const { result } = renderHook(() => useFileUpload());

    act(() => {
      result.current.addFiles([createFile("file.png", 100, "image/png")]);
    });

    await act(async () => {
      await result.current.upload({ destination: "/data/uploads" });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/files/upload"),
      expect.objectContaining({ method: "POST" })
    );

    const url = new URL(mockFetch.mock.calls[0][0], "http://localhost");
    expect(url.searchParams.get("path")).toBe("/data/uploads/file.png");
  });

  it("uses default path resolution: destination/filename", async () => {
    mockFetch.mockResolvedValueOnce(successResponse("/my/dir/report.pdf"));

    const { result } = renderHook(() => useFileUpload());

    act(() => {
      result.current.addFiles([
        createFile("report.pdf", 500, "application/pdf"),
      ]);
    });

    await act(async () => {
      await result.current.upload({ destination: "/my/dir" });
    });

    const url = new URL(mockFetch.mock.calls[0][0], "http://localhost");
    expect(url.searchParams.get("path")).toBe("/my/dir/report.pdf");
  });

  it("uses a custom resolvePath when provided", async () => {
    mockFetch.mockResolvedValueOnce(
      successResponse("gs://bucket/custom_photo.png")
    );

    const { result } = renderHook(() => useFileUpload());

    act(() => {
      result.current.addFiles([createFile("photo.png", 100, "image/png")]);
    });

    await act(async () => {
      await result.current.upload({
        destination: "gs://bucket",
        resolvePath: (dest: string, file: File) =>
          `${dest}/custom_${file.name}`,
      });
    });

    const url = new URL(mockFetch.mock.calls[0][0], "http://localhost");
    expect(url.searchParams.get("path")).toBe("gs://bucket/custom_photo.png");
  });

  it("uses a custom endpoint when provided", async () => {
    mockFetch.mockResolvedValueOnce(successResponse("/uploads/a.png"));

    const { result } = renderHook(() => useFileUpload());

    act(() => {
      result.current.addFiles([createFile("a.png", 100, "image/png")]);
    });

    await act(async () => {
      await result.current.upload({
        destination: "/uploads",
        endpoint: "/api/v2/upload",
      });
    });

    expect(mockFetch.mock.calls[0][0]).toContain("/api/v2/upload");
  });

  it("uploads multiple files", async () => {
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

    expect(result.current.files[0].status).toBe("success");
    expect(result.current.files[1].status).toBe("success");
    expect(result.current.completedFiles).toBe(2);
  });

  it("only uploads files with selected status", async () => {
    mockFetch.mockResolvedValue(successResponse("/uploads/new.png"));

    const { result } = renderHook(() => useFileUpload({ multiple: true }));

    act(() => {
      result.current.addFiles([createFile("first.png", 100, "image/png")]);
    });
    await act(async () => {
      await result.current.upload({ destination: "/uploads" });
    });

    act(() => {
      result.current.addFiles([createFile("new.png", 100, "image/png")]);
    });

    mockFetch.mockClear();
    mockFetch.mockResolvedValueOnce(successResponse("/uploads/new.png"));

    await act(async () => {
      await result.current.upload({ destination: "/uploads" });
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
