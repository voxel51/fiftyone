import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isImageFile,
  isVideoFile,
  scaledDimensions,
  createThumbnail,
} from "../thumbnail";
import { createFile } from "./helpers";

// ── Pure helpers ────────────────────────────────────────────────────────

describe("isImageFile", () => {
  it("returns true for image MIME types", () => {
    expect(isImageFile(createFile("a.png", 1, "image/png"))).toBe(true);
    expect(isImageFile(createFile("b.jpg", 1, "image/jpeg"))).toBe(true);
    expect(isImageFile(createFile("c.webp", 1, "image/webp"))).toBe(true);
  });

  it("returns false for non-image MIME types", () => {
    expect(isImageFile(createFile("a.pdf", 1, "application/pdf"))).toBe(false);
    expect(isImageFile(createFile("b.mp4", 1, "video/mp4"))).toBe(false);
    expect(isImageFile(createFile("c.txt", 1, "text/plain"))).toBe(false);
  });
});

describe("isVideoFile", () => {
  it("returns true for video MIME types", () => {
    expect(isVideoFile(createFile("a.mp4", 1, "video/mp4"))).toBe(true);
    expect(isVideoFile(createFile("b.webm", 1, "video/webm"))).toBe(true);
  });

  it("returns false for non-video MIME types", () => {
    expect(isVideoFile(createFile("a.png", 1, "image/png"))).toBe(false);
    expect(isVideoFile(createFile("b.txt", 1, "text/plain"))).toBe(false);
  });
});

describe("scaledDimensions", () => {
  it("scales down a landscape image to fit within max size", () => {
    const result = scaledDimensions(200, 100, 72);
    expect(result.width).toBe(72);
    expect(result.height).toBe(36);
  });

  it("scales down a portrait image to fit within max size", () => {
    const result = scaledDimensions(100, 200, 72);
    expect(result.width).toBe(36);
    expect(result.height).toBe(72);
  });

  it("scales down a square image to fit within max size", () => {
    const result = scaledDimensions(200, 200, 72);
    expect(result.width).toBe(72);
    expect(result.height).toBe(72);
  });

  it("does not scale up a small image", () => {
    const result = scaledDimensions(30, 20, 72);
    expect(result.width).toBe(30);
    expect(result.height).toBe(20);
  });

  it("returns the same dimensions when already at max size", () => {
    const result = scaledDimensions(72, 72, 72);
    expect(result.width).toBe(72);
    expect(result.height).toBe(72);
  });
});

// ── createThumbnail (browser API mocks) ─────────────────────────────────

describe("createThumbnail", () => {
  const FAKE_DATA_URL = "data:image/jpeg;base64,fakedata";
  let mockDrawImage: ReturnType<typeof vi.fn>;
  let mockToDataURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockDrawImage = vi.fn();
    mockToDataURL = vi.fn().mockReturnValue(FAKE_DATA_URL);

    globalThis.URL.createObjectURL = vi.fn().mockReturnValue("blob:fake-url");
    globalThis.URL.revokeObjectURL = vi.fn();

    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: mockDrawImage }),
          toDataURL: mockToDataURL,
        } as unknown as HTMLCanvasElement;
      }
      return document.createElement(tag);
    });
  });

  function stubImage(width: number, height: number) {
    vi.stubGlobal(
      "Image",
      class MockImage {
        width = width;
        height = height;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_: string) {
          setTimeout(() => this.onload?.(), 0);
        }
      }
    );
  }

  function stubImageError() {
    vi.stubGlobal(
      "Image",
      class MockImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_: string) {
          setTimeout(() => this.onerror?.(), 0);
        }
      }
    );
  }

  it("resolves with a data URL for a valid image file", async () => {
    stubImage(200, 100);
    const file = createFile("photo.png", 100, "image/png");
    const controller = new AbortController();

    const result = await createThumbnail(file, controller.signal);

    expect(result).toBe(FAKE_DATA_URL);
    expect(mockDrawImage).toHaveBeenCalledOnce();
    expect(mockToDataURL).toHaveBeenCalledWith("image/jpeg", 0.7);
  });

  it("uses custom size and quality options", async () => {
    stubImage(400, 400);
    const file = createFile("photo.png", 100, "image/png");
    const controller = new AbortController();

    await createThumbnail(file, controller.signal, {
      size: 100,
      quality: 0.5,
    });

    expect(mockToDataURL).toHaveBeenCalledWith("image/jpeg", 0.5);
  });

  it("revokes the blob URL after success", async () => {
    stubImage(100, 100);
    const file = createFile("photo.png", 100, "image/png");
    const controller = new AbortController();

    await createThumbnail(file, controller.signal);

    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith(
      "blob:fake-url"
    );
  });

  it("rejects when the image fails to load", async () => {
    stubImageError();
    const file = createFile("bad.png", 100, "image/png");
    const controller = new AbortController();

    await expect(createThumbnail(file, controller.signal)).rejects.toThrow(
      "Failed to load image for thumbnail"
    );
  });

  it("rejects with AbortError when signal is aborted", async () => {
    vi.stubGlobal(
      "Image",
      class MockImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_: string) {
          // Never resolves — simulates a slow load
        }
      }
    );

    const file = createFile("photo.png", 100, "image/png");
    const controller = new AbortController();
    const promise = createThumbnail(file, controller.signal);

    controller.abort();

    await expect(promise).rejects.toThrow("Aborted");
  });
});
