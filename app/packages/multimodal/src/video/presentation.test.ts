import { afterEach, describe, expect, it, vi } from "vitest";

import {
  copyVideoFramePresentation,
  SharedVideoPresentation,
} from "./presentation";

describe("SharedVideoPresentation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the copied source until the engine and every renderer release it", () => {
    const close = vi.fn();
    const presentation = new SharedVideoPresentation(
      { close, height: 480, width: 640 } as unknown as ImageBitmap,
      10n,
      640,
      480,
    );
    const panel = presentation.acquire();
    const frustum = presentation.acquire();
    if (!panel || !frustum) throw new Error("Expected live presentation");

    presentation.releaseOwner();
    presentation.releaseOwner();
    expect(presentation.live).toBe(true);
    expect(close).not.toHaveBeenCalled();
    const lateRenderer = presentation.acquire();
    if (!lateRenderer) throw new Error("Expected retained presentation");
    panel.release();
    panel.release();
    expect(close).not.toHaveBeenCalled();
    frustum.release();
    expect(close).not.toHaveBeenCalled();
    lateRenderer.release();
    expect(close).toHaveBeenCalledOnce();
    expect(presentation.live).toBe(false);
    expect(presentation.acquire()).toBeNull();
  });

  it("closes the decoder-backed VideoFrame immediately after copying", async () => {
    const frameClose = vi.fn();
    const bitmapClose = vi.fn();
    const createBitmap = vi.fn(async () => ({
      close: bitmapClose,
      height: 480,
      width: 640,
    }));
    vi.stubGlobal("createImageBitmap", createBitmap);
    const frame = {
      close: frameClose,
      codedHeight: 480,
      codedWidth: 640,
      displayHeight: 480,
      displayWidth: 640,
    } as unknown as VideoFrame;

    const presentation = await copyVideoFramePresentation(frame, 1n);
    expect(createBitmap).toHaveBeenCalledWith(frame);
    expect(frameClose).toHaveBeenCalledOnce();
    expect(bitmapClose).not.toHaveBeenCalled();
    presentation.releaseOwner();
    expect(bitmapClose).toHaveBeenCalledOnce();
  });

  it("uses copied-source dimensions and closes the frame when copying rejects", async () => {
    const frameClose = vi.fn();
    const frame = {
      close: frameClose,
      codedHeight: 480,
      codedWidth: 640,
      displayHeight: 480,
      displayWidth: 640,
    } as unknown as VideoFrame;
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ close: vi.fn(), height: 240, width: 320 })),
    );

    const presentation = await copyVideoFramePresentation(frame, 1n);
    expect(presentation).toMatchObject({ height: 240, width: 320 });
    presentation.releaseOwner();

    const copyError = new Error("bitmap copy failed");
    const rejectedFrameClose = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => Promise.reject(copyError)),
    );
    await expect(
      copyVideoFramePresentation(
        {
          close: rejectedFrameClose,
          codedHeight: 480,
          codedWidth: 640,
          displayHeight: 480,
          displayWidth: 640,
        } as unknown as VideoFrame,
        2n,
      ),
    ).rejects.toBe(copyError);
    expect(rejectedFrameClose).toHaveBeenCalledOnce();
  });

  it("copies through a canvas when createImageBitmap is unavailable", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    const frameClose = vi.fn();
    const frame = {
      close: frameClose,
      codedHeight: 240,
      codedWidth: 320,
      displayHeight: 240,
      displayWidth: 320,
    } as unknown as VideoFrame;

    const presentation = await copyVideoFramePresentation(frame, 2n);
    const lease = presentation.acquire();
    if (!lease) throw new Error("Expected live presentation");
    expect(lease.source).toBeInstanceOf(HTMLCanvasElement);
    expect(lease).toMatchObject({ height: 240, width: 320 });
    expect(frameClose).toHaveBeenCalledOnce();
    lease.release();
    presentation.releaseOwner();
  });
});
