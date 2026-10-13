import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const identity = (sampleId: string) => ({
  datasetId: "dataset",
  mediaField: "filepath",
  sampleId,
});
const poster = () => ({
  bytes: new Uint8Array([1, 2, 3]),
  mimeType: "image/webp",
});
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
    const { publishModalThumbnail, useModalThumbnail } =
      await import("./modal-thumbnail");
    publishModalThumbnail(identity("a"), poster());
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
  it("deduplicates posters, releases replaced URLs, and bounds retained entries", async () => {
    const { publishModalThumbnail, useModalThumbnail } =
      await import("./modal-thumbnail");
    const a = poster();
    publishModalThumbnail(identity("a"), a);
    publishModalThumbnail(identity("a"), a);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    publishModalThumbnail(identity("a"), poster());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:0");
    const { result } = renderHook(() => useModalThumbnail(identity("a")));
    act(() => {
      for (let i = 0; i < 32; i++)
        publishModalThumbnail(identity(String(i)), poster());
    });
    expect(result.current).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
  });
  it("bounds encoded bytes and owns native canvas snapshots", async () => {
    const { captureModalThumbnail, publishModalThumbnail, useModalThumbnail } =
      await import("./modal-thumbnail");
    publishModalThumbnail(identity("a"), {
      bytes: new Uint8Array(9 * 1024 * 1024),
      mimeType: "image/png",
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
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
  });
});
