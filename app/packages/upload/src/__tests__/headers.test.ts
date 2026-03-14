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

describe("upload — custom headers", () => {
  it("passes static headers to upload requests", async () => {
    mockFetch.mockResolvedValueOnce(successResponse("/uploads/a.png"));

    const { result } = renderHook(() =>
      useFileUpload({ headers: { Authorization: "Bearer token123" } })
    );

    act(() => {
      result.current.addFiles([createFile("a.png", 100, "image/png")]);
    });

    await act(async () => {
      await result.current.upload({ destination: "/uploads" });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token123",
        }),
      })
    );
  });

  it("resolves a header factory once per upload batch", async () => {
    let callCount = 0;
    mockFetch
      .mockResolvedValueOnce(successResponse("/uploads/a.png"))
      .mockResolvedValueOnce(successResponse("/uploads/b.png"));

    const { result } = renderHook(() =>
      useFileUpload({
        multiple: true,
        headers: () => ({ "X-Request-Id": `req-${++callCount}` }),
      })
    );

    act(() => {
      result.current.addFiles([
        createFile("a.png", 100, "image/png"),
        createFile("b.png", 100, "image/png"),
      ]);
    });

    await act(async () => {
      await result.current.upload({ destination: "/uploads" });
    });

    const headers1 = mockFetch.mock.calls[0][1].headers;
    const headers2 = mockFetch.mock.calls[1][1].headers;
    expect(headers1["X-Request-Id"]).toBe("req-1");
    expect(headers2["X-Request-Id"]).toBe("req-1");
    expect(callCount).toBe(1);
  });

  it("calls the header factory again on a separate upload", async () => {
    let callCount = 0;
    mockFetch.mockResolvedValue(successResponse("/uploads/a.png"));

    const { result } = renderHook(() =>
      useFileUpload({
        headers: () => ({ "X-Token": `tok-${++callCount}` }),
      })
    );

    act(() => {
      result.current.addFiles([createFile("a.png", 100, "image/png")]);
    });
    await act(async () => {
      await result.current.upload({ destination: "/uploads" });
    });

    act(() => {
      result.current.addFiles([createFile("b.png", 200, "image/png")]);
    });
    await act(async () => {
      await result.current.upload({ destination: "/uploads" });
    });

    expect(callCount).toBe(2);
    expect(mockFetch.mock.calls[0][1].headers["X-Token"]).toBe("tok-1");
    expect(mockFetch.mock.calls[1][1].headers["X-Token"]).toBe("tok-2");
  });

  it("resolves an async header factory", async () => {
    mockFetch.mockResolvedValueOnce(successResponse("/uploads/a.png"));

    const { result } = renderHook(() =>
      useFileUpload({
        headers: async () => ({ Authorization: "Bearer async-token" }),
      })
    );

    act(() => {
      result.current.addFiles([createFile("a.png", 100, "image/png")]);
    });

    await act(async () => {
      await result.current.upload({ destination: "/uploads" });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer async-token",
        }),
      })
    );
  });

  it("passes headers to DELETE requests on cancel", async () => {
    mockFetch.mockResolvedValueOnce(successResponse("/uploads/a.png"));

    const { result } = renderHook(() =>
      useFileUpload({ headers: { Authorization: "Bearer token" } })
    );

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

    const deleteCall = mockFetch.mock.calls[1];
    expect(deleteCall[1]).toEqual(
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          Authorization: "Bearer token",
        }),
      })
    );
  });

  it("sets Content-Type from file MIME type when no custom headers configured", async () => {
    mockFetch.mockResolvedValueOnce(successResponse("/uploads/a.png"));

    const { result } = renderHook(() => useFileUpload());

    act(() => {
      result.current.addFiles([createFile("a.png", 100, "image/png")]);
    });

    await act(async () => {
      await result.current.upload({ destination: "/uploads" });
    });

    expect(mockFetch.mock.calls[0][1].headers).toEqual({
      "Content-Type": "image/png",
    });
  });
});
