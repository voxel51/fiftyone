import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModalThumbnailPosterCache } from "./modal-thumbnail";

const identity = (sampleId: string) => ({
  datasetId: "dataset",
  mediaField: "filepath",
  sampleId,
});
const poster = () => ({
  bytes: new Uint8Array([1, 2, 3]),
  mimeType: "image/webp",
});

function posterCache() {
  const entries = new Map<string, ReturnType<typeof poster>>();
  const listeners = new Set<() => void>();
  const cache: ModalThumbnailPosterCache = {
    peek: (key) => entries.get(key) ?? null,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    cache,
    put: (key: string, value = poster()) => {
      entries.set(key, value);
      for (const listener of listeners) listener();
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  let next = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:${next++}`);
  vi.spyOn(URL, "revokeObjectURL");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("modal thumbnail ownership", () => {
  it("never substitutes an outgoing sample, dataset, or media field", async () => {
    const { registerModalThumbnailPoster, useModalThumbnail } =
      await import("./modal-thumbnail");
    const posters = posterCache();
    posters.put("poster-a");
    registerModalThumbnailPoster(identity("a"), "poster-a", posters.cache);
    const { result, rerender } = renderHook((id) => useModalThumbnail(id), {
      initialProps: identity("a"),
    });
    expect(result.current?.kind).toBe("image");
    rerender(identity("b"));
    expect(result.current).toBeNull();
    rerender({ ...identity("a"), datasetId: "other" });
    expect(result.current).toBeNull();
    rerender({ ...identity("a"), mediaField: "other" });
    expect(result.current).toBeNull();
  });

  it("copies a poster only when its destination is shown", async () => {
    const { registerModalThumbnailPoster, useModalThumbnail } =
      await import("./modal-thumbnail");
    const posters = posterCache();
    for (let i = 0; i < 40; i++) {
      posters.put(`poster-${i}`);
      registerModalThumbnailPoster(
        identity(String(i)),
        `poster-${i}`,
        posters.cache,
      );
    }
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    const { result, rerender } = renderHook((id) => useModalThumbnail(id), {
      initialProps: identity("0"),
    });
    rerender(identity("0"));
    expect(result.current?.kind).toBe("image");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("shows a poster encoded after activation and follows replacements", async () => {
    const { registerModalThumbnailPoster, useModalThumbnail } =
      await import("./modal-thumbnail");
    const posters = posterCache();
    registerModalThumbnailPoster(identity("a"), "poster-a", posters.cache);
    const { result } = renderHook(() => useModalThumbnail(identity("a")));
    expect(result.current).toBeNull();
    act(() => posters.put("poster-a"));
    expect(result.current).toEqual({ kind: "image", url: "blob:0" });
    act(() => posters.put("poster-a"));
    expect(result.current).toEqual({ kind: "image", url: "blob:1" });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:0");
  });

  it("ignores a late poster for a sample's replaced cache key", async () => {
    const { registerModalThumbnailPoster, useModalThumbnail } =
      await import("./modal-thumbnail");
    const posters = posterCache();
    registerModalThumbnailPoster(identity("a"), "poster-old", posters.cache);
    const { result } = renderHook(() => useModalThumbnail(identity("a")));
    act(() =>
      registerModalThumbnailPoster(identity("a"), "poster-new", posters.cache),
    );
    act(() => posters.put("poster-old"));
    expect(result.current).toBeNull();
    act(() => posters.put("poster-new"));
    expect(result.current?.kind).toBe("image");
  });

  it("releases URLs for destinations no longer shown", async () => {
    const { registerModalThumbnailPoster, useModalThumbnail } =
      await import("./modal-thumbnail");
    const posters = posterCache();
    const { rerender } = renderHook((id) => useModalThumbnail(id), {
      initialProps: identity("none"),
    });
    for (let i = 0; i < 17; i++) {
      posters.put(`poster-${i}`);
      registerModalThumbnailPoster(
        identity(String(i)),
        `poster-${i}`,
        posters.cache,
      );
      rerender(identity(String(i)));
    }
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:0");
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("keeps a reused poster URL when evicting the least recent destination", async () => {
    const { registerModalThumbnailPoster, useModalThumbnail } =
      await import("./modal-thumbnail");
    const posters = posterCache();
    for (let i = 0; i < 17; i++) {
      posters.put(`poster-${i}`);
      registerModalThumbnailPoster(
        identity(String(i)),
        `poster-${i}`,
        posters.cache,
      );
    }
    const { result, rerender } = renderHook((id) => useModalThumbnail(id), {
      initialProps: identity("0"),
    });
    const first = result.current;
    for (let i = 1; i < 16; i++) rerender(identity(String(i)));
    rerender(identity("0"));
    expect(result.current).toBe(first);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(16);

    rerender(identity("16"));
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:1");
    rerender(identity("0"));
    expect(result.current).toBe(first);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(17);
  });

  it("owns a canvas snapshot until its encoded poster arrives", async () => {
    const {
      captureModalThumbnail,
      registerModalThumbnailPoster,
      useModalThumbnail,
    } = await import("./modal-thumbnail");
    const posters = posterCache();
    registerModalThumbnailPoster(identity("a"), "poster-a", posters.cache);
    const source = document.createElement("canvas");
    source.width = 1024;
    source.height = 512;
    captureModalThumbnail(identity("a"), source);
    const { result } = renderHook(() => useModalThumbnail(identity("a")));
    expect(result.current?.kind).toBe("canvas");
    if (result.current?.kind !== "canvas") throw new Error("missing snapshot");
    expect(result.current.canvas).not.toBe(source);
    source.width = 0;
    expect(result.current.canvas.width).toBe(512);
    expect(result.current.canvas.height).toBe(256);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    const snapshotCanvas = result.current.canvas;
    act(() => posters.put("poster-a"));
    expect(result.current?.kind).toBe("image");
    expect(snapshotCanvas.width).toBe(0);
    expect(snapshotCanvas.height).toBe(0);
  });

  it("discards a canvas snapshot when the sample's poster key changes", async () => {
    const {
      captureModalThumbnail,
      registerModalThumbnailPoster,
      useModalThumbnail,
    } = await import("./modal-thumbnail");
    const posters = posterCache();
    registerModalThumbnailPoster(identity("a"), "old-camera", posters.cache);
    const source = document.createElement("canvas");
    source.width = 100;
    source.height = 100;
    captureModalThumbnail(identity("a"), source);
    const { result } = renderHook(() => useModalThumbnail(identity("a")));
    if (result.current?.kind !== "canvas") throw new Error("missing snapshot");
    const snapshotCanvas = result.current.canvas;
    act(() =>
      registerModalThumbnailPoster(identity("a"), "new-camera", posters.cache),
    );
    expect(result.current).toBeNull();
    expect(snapshotCanvas.width).toBe(0);
    // Completion of the old grid encode must not restore the old camera.
    act(() => posters.put("old-camera"));
    expect(result.current).toBeNull();
    act(() => posters.put("new-camera"));
    expect(result.current?.kind).toBe("image");
  });
});
