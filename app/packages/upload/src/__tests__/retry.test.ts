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

describe("retry", () => {
  it("re-uploads a failed file and transitions to success", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("fail"));

    const { result } = renderHook(() => useFileUpload());

    act(() => {
      result.current.addFiles([createFile("a.png", 100, "image/png")]);
    });

    await act(async () => {
      await result.current.upload({ destination: "/uploads" });
    });
    expect(result.current.files[0].status).toBe("error");

    mockFetch.mockResolvedValueOnce(successResponse("/uploads/a.png"));

    await act(async () => {
      await result.current.retry(result.current.files[0].id);
    });

    expect(result.current.files[0].status).toBe("success");
    expect(result.current.files[0].remotePath).toBe("/uploads/a.png");
    expect(result.current.files[0].error).toBeUndefined();
  });

  it("re-uploads to the same destination path", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("fail"));

    const { result } = renderHook(() => useFileUpload());

    act(() => {
      result.current.addFiles([createFile("a.png", 100, "image/png")]);
    });

    await act(async () => {
      await result.current.upload({ destination: "/my/uploads" });
    });

    mockFetch.mockClear();
    mockFetch.mockResolvedValueOnce(successResponse("/my/uploads/a.png"));

    await act(async () => {
      await result.current.retry(result.current.files[0].id);
    });

    const url = new URL(mockFetch.mock.calls[0][0], "http://localhost");
    expect(url.searchParams.get("path")).toBe("/my/uploads/a.png");
  });

  it("can fail again and be retried again", async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError("fail 1"))
      .mockRejectedValueOnce(new TypeError("fail 2"))
      .mockResolvedValueOnce(successResponse("/uploads/a.png"));

    const { result } = renderHook(() => useFileUpload());

    act(() => {
      result.current.addFiles([createFile("a.png", 100, "image/png")]);
    });

    await act(async () => {
      await result.current.upload({ destination: "/uploads" });
    });
    expect(result.current.files[0].status).toBe("error");

    await act(async () => {
      await result.current.retry(result.current.files[0].id);
    });
    expect(result.current.files[0].status).toBe("error");

    await act(async () => {
      await result.current.retry(result.current.files[0].id);
    });
    expect(result.current.files[0].status).toBe("success");
  });
});
