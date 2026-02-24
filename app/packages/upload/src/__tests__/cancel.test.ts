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

describe("cancel", () => {
  it("removes a selected file from the list", async () => {
    const { result } = renderHook(() => useFileUpload({ multiple: true }));

    act(() => {
      result.current.addFiles([
        createFile("a.png", 100, "image/png"),
        createFile("b.png", 200, "image/png"),
      ]);
    });

    const id = result.current.files[0].id;

    await act(async () => {
      await result.current.cancel(id);
    });

    expect(result.current.files).toHaveLength(1);
    expect(result.current.files[0].name).toBe("b.png");
  });

  it("aborts and removes an uploading file", async () => {
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

    expect(result.current.files[0].status).toBe("uploading");

    const id = result.current.files[0].id;
    await act(async () => {
      await result.current.cancel(id);
    });

    expect(result.current.files).toHaveLength(0);

    d.resolve(successResponse("/uploads/a.png"));
    await act(async () => {
      await uploadPromise;
    });
  });

  it("sends DELETE and removes a successfully uploaded file", async () => {
    mockFetch.mockResolvedValueOnce(successResponse("/uploads/a.png"));

    const { result } = renderHook(() => useFileUpload());

    act(() => {
      result.current.addFiles([createFile("a.png", 100, "image/png")]);
    });

    await act(async () => {
      await result.current.upload({ destination: "/uploads" });
    });

    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const id = result.current.files[0].id;
    await act(async () => {
      await result.current.cancel(id);
    });

    expect(result.current.files).toHaveLength(0);

    const deleteCall = mockFetch.mock.calls[1];
    expect(deleteCall[1]).toEqual(
      expect.objectContaining({ method: "DELETE" })
    );
    const deleteUrl = new URL(deleteCall[0], "http://localhost");
    expect(deleteUrl.searchParams.get("path")).toBe("/uploads/a.png");
  });

  it("removes an errored file without any network call", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("fail"));

    const { result } = renderHook(() => useFileUpload());

    act(() => {
      result.current.addFiles([createFile("a.png", 100, "image/png")]);
    });

    await act(async () => {
      await result.current.upload({ destination: "/uploads" });
    });

    mockFetch.mockClear();

    const id = result.current.files[0].id;
    await act(async () => {
      await result.current.cancel(id);
    });

    expect(result.current.files).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
