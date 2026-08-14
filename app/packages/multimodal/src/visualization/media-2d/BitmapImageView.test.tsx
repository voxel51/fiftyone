import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, type Mock, vi } from "vitest";

import type {
  EncodedVideoVisualization,
  RawImageVisualization,
} from "../../ir";
import { VISUALIZATION_KIND } from "../visualization-registry";
import { imageDisplayRect } from "./Base2dScene";
import {
  BITMAP_IMAGE_RESIZE_DEBOUNCE_MS,
  BitmapCanvasHost,
  BitmapImageFrameView,
  BitmapImageView,
  bitmapDecodeOptions,
  bitmapDrawRect,
  encodedImageDimensions,
} from "./BitmapImageView";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("bitmapDrawRect", () => {
  it("center-crops a tall image into a wide container in cover mode", () => {
    // Image fills the container width; the vertical overflow is split
    // evenly above and below (the canvas clips it).
    expect(
      bitmapDrawRect(
        { height: 50, width: 100 },
        { height: 200, width: 200 },
        "cover",
      ),
    ).toEqual({ height: 100, width: 100, x: 0, y: -25 });
  });

  it("center-crops a wide image into a square container in cover mode", () => {
    expect(
      bitmapDrawRect(
        { height: 100, width: 100 },
        { height: 100, width: 200 },
        "cover",
      ),
    ).toEqual({ height: 100, width: 200, x: -50, y: 0 });
  });

  it("letterboxes in contain mode", () => {
    expect(
      bitmapDrawRect(
        { height: 300, width: 400 },
        { height: 100, width: 200 },
        "contain",
      ),
    ).toEqual({ height: 200, width: 400, x: 0, y: 50 });
  });

  it("matches the WebGPU ImagePanel fit math exactly", () => {
    // Parity contract with Base2dScene's imageDisplayRect: the P2 hover
    // transition swaps this view for a live panel, so the two paths must
    // place every pixel identically.
    const cases = [
      {
        container: { height: 50, width: 100 },
        image: { height: 200, width: 200 },
      },
      {
        container: { height: 300, width: 400 },
        image: { height: 100, width: 200 },
      },
      {
        container: { height: 173, width: 231 },
        image: { height: 720, width: 1280 },
      },
      {
        container: { height: 1, width: 1 },
        image: { height: 4096, width: 16 },
      },
      { container: { height: 0, width: 0 }, image: { height: 10, width: 10 } },
    ] as const;

    for (const { container, image } of cases) {
      for (const fit of ["contain", "cover"] as const) {
        expect(bitmapDrawRect(container, image, fit)).toEqual(
          imageDisplayRect(container, image, fit),
        );
      }
    }
  });
});

describe("grid bitmap decode sizing", () => {
  it("decodes only the pixels a covered tile can display", () => {
    expect(
      bitmapDecodeOptions(
        { height: 200, width: 200 },
        { height: 2_000, width: 4_000 },
        "cover",
      ),
    ).toEqual({
      colorSpaceConversion: "none",
      resizeHeight: 200,
      resizeQuality: "high",
      resizeWidth: 400,
    });
  });

  it("reads PNG dimensions without decoding full-resolution pixels", () => {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47], 0);
    bytes.set([0x49, 0x48, 0x44, 0x52], 12);
    bytes.set([0, 0, 0x0f, 0xa0], 16);
    bytes.set([0, 0, 0x07, 0xd0], 20);

    expect(encodedImageDimensions(bytes)).toEqual({
      height: 2_000,
      width: 4_000,
    });
  });

  it("reads JPEG and WebP variants and rejects truncated headers", () => {
    const jpeg = Uint8Array.of(
      0xff,
      0xd8,
      0xff,
      0xc0,
      0,
      7,
      8,
      0x01,
      0xe0,
      0x02,
      0x80,
    );
    const vp8x = webpHeader("VP8X");
    writeUint24Le(vp8x, 24, 639);
    writeUint24Le(vp8x, 27, 479);
    const vp8 = webpHeader("VP8 ");
    vp8.set([0x9d, 0x01, 0x2a], 23);
    vp8.set([0x80, 0x02, 0xe0, 0x01], 26);
    const vp8l = webpHeader("VP8L");
    vp8l[20] = 0x2f;
    const vp8lBits = 639 | (479 << 14);
    vp8l.set(
      [
        vp8lBits & 0xff,
        (vp8lBits >>> 8) & 0xff,
        (vp8lBits >>> 16) & 0xff,
        (vp8lBits >>> 24) & 0xff,
      ],
      21,
    );

    for (const bytes of [jpeg, vp8x, vp8, vp8l]) {
      expect(encodedImageDimensions(bytes)).toEqual({
        height: 480,
        width: 640,
      });
      expect(encodedImageDimensions(bytes.subarray(0, 10))).toBeNull();
    }
  });
});

describe("BitmapImageFrameView", () => {
  it("reuses the raw-image source canvas across frame updates", async () => {
    stubElementSize(100, 50);
    const context = sharedMockContext();
    const drawImage = vi.spyOn(context, "drawImage");
    vi.spyOn(context, "createImageData").mockReturnValue({
      data: new Uint8ClampedArray(8),
      height: 1,
      width: 2,
    } as ImageData);
    vi.spyOn(context, "putImageData").mockImplementation(() => undefined);

    const { rerender } = render(
      <BitmapImageFrameView
        frame={rawFrame([255, 0, 0, 255, 0, 0, 255, 255])}
      />,
    );

    await waitFor(() => expect(drawImage).toHaveBeenCalledTimes(1));
    const source = drawImage.mock.calls[0]?.[0];

    rerender(
      <BitmapImageFrameView
        frame={rawFrame([0, 255, 0, 255, 0, 0, 255, 255])}
      />,
    );

    await waitFor(() => expect(drawImage).toHaveBeenCalledTimes(2));
    expect(drawImage.mock.calls[1]?.[0]).toBe(source);
  });

  it("retains only a tile-sized raw staging surface with exact sampled RGBA", async () => {
    stubElementSize(200, 200);
    const context = sharedMockContext();
    const drawImage = vi.spyOn(context, "drawImage");
    vi.spyOn(context, "createImageData").mockReturnValue({
      data: new Uint8ClampedArray(400 * 200 * 4),
      height: 200,
      width: 400,
    } as ImageData);
    const putImageData = vi
      .spyOn(context, "putImageData")
      .mockImplementation(() => undefined);
    const onBitmapRetainedBytesChange = vi.fn();
    const onImageLoaded = vi.fn();
    const rgba = new Uint8Array(4_000 * 2_000 * 4);
    rgba.set([255, 10, 20, 255], (5 * 4_000 + 5) * 4);
    rgba.set([30, 40, 255, 255], (1_995 * 4_000 + 3_995) * 4);

    const rendered = render(
      <BitmapImageFrameView
        frame={rawFrameWithDimensions(rgba, 4_000, 2_000)}
        onBitmapRetainedBytesChange={onBitmapRetainedBytesChange}
        onImageLoaded={onImageLoaded}
      />,
    );

    await waitFor(() => expect(putImageData).toHaveBeenCalledOnce());
    expect(context.createImageData).toHaveBeenCalledWith(400, 200);
    const preview = putImageData.mock.calls[0]?.[0];
    expect(Array.from(preview.data.subarray(0, 4))).toEqual([255, 10, 20, 255]);
    expect(Array.from(preview.data.slice(-4))).toEqual([30, 40, 255, 255]);
    expect(onImageLoaded).toHaveBeenCalledWith(4_000, 2_000);
    expect(onBitmapRetainedBytesChange).toHaveBeenCalledWith(400 * 200 * 4);

    const stagingCanvas = drawImage.mock.calls[0]?.[0] as HTMLCanvasElement;
    expect(stagingCanvas.width).toBe(400);
    expect(stagingCanvas.height).toBe(200);
    expect(drawImage).toHaveBeenCalledWith(stagingCanvas, -100, 0, 400, 200);
    rendered.unmount();
    expect(stagingCanvas.width).toBe(0);
    expect(stagingCanvas.height).toBe(0);
  });

  it("materializes native depth RGBA only for the bitmap fallback", async () => {
    stubElementSize(100, 50);
    const context = sharedMockContext();
    const imageData = {
      data: new Uint8ClampedArray(8),
      height: 1,
      width: 2,
    } as ImageData;
    vi.spyOn(context, "createImageData").mockReturnValue(imageData);
    const putImageData = vi
      .spyOn(context, "putImageData")
      .mockImplementation(() => undefined);

    render(<BitmapImageFrameView frame={depthFrame()} />);

    await waitFor(() => expect(putImageData).toHaveBeenCalledOnce());
    expect(Array.from(imageData.data)).toEqual([
      0, 0, 0, 0, 255, 255, 255, 255,
    ]);
  });
});

describe("BitmapImageView", () => {
  it("re-decodes at a larger size when the tile grows", async () => {
    const decodes = stubCreateImageBitmap();
    let width = 100;
    let height = 50;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      () =>
        ({
          bottom: height,
          height,
          left: 0,
          right: width,
          top: 0,
          width,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    );
    let resize: ResizeObserverCallback | null = null;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback;
        }
        disconnect() {
          // no-op in the test observer
        }
        observe() {
          // no-op in the test observer
        }
        unobserve() {
          // no-op in the test observer
        }
      },
    );
    sharedMockContext();
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47], 0);
    bytes.set([0x49, 0x48, 0x44, 0x52], 12);
    bytes.set([0, 0, 0x0f, 0xa0], 16);
    bytes.set([0, 0, 0x07, 0xd0], 20);

    render(<BitmapImageView bytes={bytes} />);
    expect(createImageBitmap).toHaveBeenCalledTimes(1);
    decodes.settle(0, fakeBitmap(100, 50));

    width = 200;
    height = 100;
    act(() => {
      resize?.([], {} as ResizeObserver);
    });

    await waitFor(() => expect(createImageBitmap).toHaveBeenCalledTimes(2));
    expect(vi.mocked(createImageBitmap).mock.calls[1]?.[1]).toMatchObject({
      resizeHeight: 100,
      resizeWidth: 200,
    });
  });

  it("coalesces a resize burst into one decode at the final tile size", async () => {
    vi.useFakeTimers({ toFake: ["clearTimeout", "setTimeout"] });
    const decodes = stubCreateImageBitmap();
    let width = 100;
    let height = 50;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      () =>
        ({
          bottom: height,
          height,
          left: 0,
          right: width,
          top: 0,
          width,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    );
    let resize: ResizeObserverCallback | null = null;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback;
        }
        disconnect() {
          // no-op in the test observer
        }
        observe() {
          // no-op in the test observer
        }
        unobserve() {
          // no-op in the test observer
        }
      },
    );
    sharedMockContext();
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47], 0);
    bytes.set([0x49, 0x48, 0x44, 0x52], 12);
    bytes.set([0, 0, 0x0f, 0xa0], 16);
    bytes.set([0, 0, 0x07, 0xd0], 20);

    render(<BitmapImageView bytes={bytes} />);
    expect(createImageBitmap).toHaveBeenCalledTimes(1);
    decodes.settle(0, fakeBitmap(100, 50));
    await act(async () => undefined);

    for (const [nextWidth, nextHeight] of [
      [120, 60],
      [160, 80],
      [240, 120],
    ]) {
      width = nextWidth;
      height = nextHeight;
      act(() => resize?.([], {} as ResizeObserver));
    }

    expect(createImageBitmap).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(BITMAP_IMAGE_RESIZE_DEBOUNCE_MS - 1));
    expect(createImageBitmap).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1));
    expect(createImageBitmap).toHaveBeenCalledTimes(2);
    expect(vi.mocked(createImageBitmap).mock.calls[1]?.[1]).toMatchObject({
      resizeHeight: 120,
      resizeWidth: 240,
    });
  });

  it("requests a tile-sized bitmap while preserving natural dimensions", async () => {
    const decodes = stubCreateImageBitmap();
    stubElementSize(200, 200);
    sharedMockContext();
    const onBitmapRetainedBytesChange = vi.fn();
    const onImageLoaded = vi.fn();
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47], 0);
    bytes.set([0x49, 0x48, 0x44, 0x52], 12);
    bytes.set([0, 0, 0x0f, 0xa0], 16);
    bytes.set([0, 0, 0x07, 0xd0], 20);

    render(
      <BitmapImageView
        bytes={bytes}
        onBitmapRetainedBytesChange={onBitmapRetainedBytesChange}
        onImageLoaded={onImageLoaded}
      />,
    );

    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), {
      colorSpaceConversion: "none",
      resizeHeight: 200,
      resizeQuality: "high",
      resizeWidth: 400,
    });

    decodes.settle(0, fakeBitmap(400, 200));
    await waitFor(() =>
      expect(onImageLoaded).toHaveBeenCalledWith(4_000, 2_000),
    );
    expect(onBitmapRetainedBytesChange).toHaveBeenCalledWith(400 * 200 * 4);
  });

  it("decodes, sizes the backing store to CSS pixels, and draws with cover math", async () => {
    const decodes = stubCreateImageBitmap();
    stubElementSize(100, 50);
    const context = sharedMockContext();
    const drawImage = vi.spyOn(context, "drawImage");
    const onImageLoaded = vi.fn();

    const { container } = render(
      <BitmapImageView
        bytes={new Uint8Array([1])}
        fit="cover"
        onImageLoaded={onImageLoaded}
      />,
    );

    const bitmap = fakeBitmap(200, 200);
    decodes.settle(0, bitmap);

    await waitFor(() => expect(drawImage).toHaveBeenCalledTimes(1));

    // 200x200 into 100x50 cover: fills the width, crops 25px top+bottom.
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, -25, 100, 100);
    const canvas = container.querySelector("canvas");
    expect(canvas?.width).toBe(100);
    expect(canvas?.height).toBe(50);
    // Natural decoded dims, not container dims — the annotations overlay
    // positions itself by these.
    expect(onImageLoaded).toHaveBeenCalledTimes(1);
    expect(onImageLoaded).toHaveBeenCalledWith(200, 200);
  });

  it("bounds rapid frame churn and commits only the latest queued decode", async () => {
    const decodes = stubCreateImageBitmap();
    stubElementSize(100, 50);
    const context = sharedMockContext();
    const drawImage = vi.spyOn(context, "drawImage");
    const onImageLoaded = vi.fn();

    const { rerender } = render(
      <BitmapImageView
        bytes={new Uint8Array([1])}
        onImageLoaded={onImageLoaded}
      />,
    );
    rerender(
      <BitmapImageView
        bytes={new Uint8Array([2])}
        onImageLoaded={onImageLoaded}
      />,
    );
    rerender(
      <BitmapImageView
        bytes={new Uint8Array([3])}
        onImageLoaded={onImageLoaded}
      />,
    );

    // createImageBitmap cannot abort the running decode, but intermediate
    // frames never start and the queue remains one latest request deep.
    expect(createImageBitmap).toHaveBeenCalledTimes(1);
    const stale = fakeBitmap(10, 10);
    decodes.settle(0, stale);
    await waitFor(() => expect(stale.close).toHaveBeenCalledTimes(1));
    expect(drawImage).not.toHaveBeenCalled();
    expect(createImageBitmap).toHaveBeenCalledTimes(2);

    const latest = fakeBitmap(30, 30);
    decodes.settle(1, latest);
    await waitFor(() => expect(drawImage).toHaveBeenCalledTimes(1));

    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawImage).toHaveBeenCalledWith(
      latest,
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(latest.close).not.toHaveBeenCalled();
    expect(onImageLoaded).toHaveBeenCalledTimes(1);
    expect(onImageLoaded).toHaveBeenCalledWith(30, 30);
  });

  it("closes the previous bitmap on replacement and the last one on unmount", async () => {
    const decodes = stubCreateImageBitmap();
    stubElementSize(100, 50);
    const context = sharedMockContext();
    const drawImage = vi.spyOn(context, "drawImage");

    const { rerender, unmount } = render(
      <BitmapImageView bytes={new Uint8Array([1])} />,
    );
    const first = fakeBitmap(10, 10);
    decodes.settle(0, first);
    await waitFor(() => expect(drawImage).toHaveBeenCalledTimes(1));

    rerender(<BitmapImageView bytes={new Uint8Array([2])} />);
    const second = fakeBitmap(20, 20);
    decodes.settle(1, second);
    await waitFor(() => expect(drawImage).toHaveBeenCalledTimes(2));

    expect(first.close).toHaveBeenCalledTimes(1);
    expect(second.close).not.toHaveBeenCalled();

    unmount();
    expect(second.close).toHaveBeenCalledTimes(1);
  });

  it("keeps the last good frame and reports when a decode fails", async () => {
    const decodes = stubCreateImageBitmap();
    stubElementSize(100, 50);
    const context = sharedMockContext();
    const drawImage = vi.spyOn(context, "drawImage");
    const clearRect = vi.spyOn(context, "clearRect");
    const onError = vi.fn();

    const { rerender } = render(
      <BitmapImageView bytes={new Uint8Array([1])} onError={onError} />,
    );
    const good = fakeBitmap(10, 10);
    decodes.settle(0, good);
    await waitFor(() => expect(drawImage).toHaveBeenCalledTimes(1));

    rerender(<BitmapImageView bytes={new Uint8Array([2])} onError={onError} />);
    const failure = new Error("bad bytes");
    decodes.fail(1, failure);
    await waitFor(() => expect(onError).toHaveBeenCalledWith(failure));

    // No blanking: the committed bitmap stays drawn and untouched.
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(clearRect).toHaveBeenCalledTimes(1);
    expect(good.close).not.toHaveBeenCalled();
  });

  it("renders nothing but still reports when the first decode fails", async () => {
    const decodes = stubCreateImageBitmap();
    stubElementSize(100, 50);
    const context = sharedMockContext();
    const drawImage = vi.spyOn(context, "drawImage");
    const onError = vi.fn();
    const onImageLoaded = vi.fn();

    render(
      <BitmapImageView
        bytes={new Uint8Array([1])}
        onError={onError}
        onImageLoaded={onImageLoaded}
      />,
    );
    const failure = new Error("bad bytes");
    decodes.fail(0, failure);

    await waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
    expect(drawImage).not.toHaveBeenCalled();
    expect(onImageLoaded).not.toHaveBeenCalled();
  });
});

describe("BitmapImageFrameView", () => {
  it("decodes encoded video frames and draws them into the grid canvas", async () => {
    stubVideoDecoder();
    stubElementSize(100, 50);
    const context = sharedMockContext();
    const drawImage = vi.spyOn(context, "drawImage");
    const onImageLoaded = vi.fn();

    render(
      <BitmapImageFrameView
        frame={videoFrame()}
        onImageLoaded={onImageLoaded}
      />,
    );

    await waitFor(() => expect(onImageLoaded).toHaveBeenCalledWith(640, 480));

    expect(drawImage).toHaveBeenCalledTimes(3);
    expect(drawImage.mock.calls[0]?.[0]).toMatchObject({
      displayHeight: 480,
      displayWidth: 640,
    });
    expect(drawImage.mock.calls[1]?.[0]).toBeInstanceOf(HTMLCanvasElement);
    expect(drawImage.mock.calls[2]?.[0]).toBeInstanceOf(HTMLCanvasElement);
    expect(drawImage.mock.calls[2]?.slice(1)).toEqual([0, -12.5, 100, 75]);
  });

  it("keeps one decoder session across keyframe-to-delta rerenders", async () => {
    const decoder = stubVideoDecoder();
    stubElementSize(100, 50);
    sharedMockContext();
    const onImageLoaded = vi.fn();

    const rendered = render(
      <BitmapImageFrameView
        frame={videoFrame()}
        onImageLoaded={onImageLoaded}
      />,
    );
    await waitFor(() => expect(onImageLoaded).toHaveBeenCalledTimes(1));

    rendered.rerender(
      <BitmapImageFrameView
        frame={deltaVideoFrame()}
        onImageLoaded={onImageLoaded}
      />,
    );
    await waitFor(() => expect(onImageLoaded).toHaveBeenCalledTimes(2));

    expect(decoder.instances).toHaveLength(1);
    expect(decoder.instances[0].decodeCalls.map((chunk) => chunk.type)).toEqual(
      ["key", "delta"],
    );
    expect(decoder.instances[0].close).not.toHaveBeenCalled();

    rendered.unmount();
    expect(decoder.instances[0].close).toHaveBeenCalledOnce();
  });

  it("waits for a keyframe before bootstrapping a private preview", async () => {
    const decoder = stubVideoDecoder();
    stubElementSize(100, 50);
    sharedMockContext();
    const onError = vi.fn();
    const onImageLoaded = vi.fn();

    const rendered = render(
      <BitmapImageFrameView
        frame={deltaVideoFrame()}
        onError={onError}
        onImageLoaded={onImageLoaded}
      />,
    );

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        new Error("H.264 preview is waiting for a keyframe"),
      ),
    );
    expect(decoder.instances).toHaveLength(0);
    expect(onImageLoaded).not.toHaveBeenCalled();

    rendered.rerender(
      <BitmapImageFrameView
        frame={videoFrame()}
        onError={onError}
        onImageLoaded={onImageLoaded}
      />,
    );
    await waitFor(() => expect(onImageLoaded).toHaveBeenCalledTimes(1));
    expect(decoder.instances).toHaveLength(1);
    expect(decoder.instances[0].decodeCalls.map((chunk) => chunk.type)).toEqual(
      ["key"],
    );
  });

  it("releases the preview decoder when its source/stream key changes", async () => {
    const decoder = stubVideoDecoder();
    stubElementSize(100, 50);
    sharedMockContext();
    const onImageLoaded = vi.fn();
    const onBitmapRetainedBytesChange = vi.fn();

    const rendered = render(
      <BitmapImageFrameView
        frame={videoFrame()}
        onBitmapRetainedBytesChange={onBitmapRetainedBytesChange}
        onImageLoaded={onImageLoaded}
        videoSessionKey={"source-a\n/camera"}
      />,
    );
    await waitFor(() => expect(onImageLoaded).toHaveBeenCalledTimes(1));
    onBitmapRetainedBytesChange.mockClear();

    rendered.rerender(
      <BitmapImageFrameView
        frame={videoFrame()}
        onBitmapRetainedBytesChange={onBitmapRetainedBytesChange}
        onImageLoaded={onImageLoaded}
        videoSessionKey={"source-b\n/camera"}
      />,
    );
    await waitFor(() =>
      expect(onBitmapRetainedBytesChange).toHaveBeenCalledWith(0),
    );
    await waitFor(() => expect(onImageLoaded).toHaveBeenCalledTimes(2));

    expect(decoder.instances).toHaveLength(2);
    expect(decoder.instances[0].close).toHaveBeenCalledOnce();
    expect(decoder.instances[1].close).not.toHaveBeenCalled();
  });

  it("reports encoded video preview decode failures", async () => {
    vi.stubGlobal("EncodedVideoChunk", undefined);
    vi.stubGlobal("VideoDecoder", undefined);
    const onError = vi.fn();
    const onImageLoaded = vi.fn();

    render(
      <BitmapImageFrameView
        frame={videoFrame()}
        onError={onError}
        onImageLoaded={onImageLoaded}
      />,
    );

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0]?.[0]).toEqual(
      new Error("WebCodecs H.264 decoding is unavailable"),
    );
    expect(onImageLoaded).not.toHaveBeenCalled();
  });
});

describe("BitmapCanvasHost", () => {
  it("draws a ready bitmap 1:1 when it matches the container size", () => {
    stubElementSize(100, 50);
    const context = sharedMockContext();
    const drawImage = vi.spyOn(context, "drawImage");
    const bitmap = fakeBitmap(100, 50);
    const onCanvasCommitted = vi.fn();

    const { container } = render(
      <BitmapCanvasHost
        bitmap={bitmap}
        onCanvasCommitted={onCanvasCommitted}
      />,
    );

    // Snapshots are rendered at the cell's CSS pixel size, so cover fit
    // degenerates to an exact 1:1 blit — no crop, no stretch.
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 100, 50);
    const canvas = container.querySelector("canvas");
    expect(canvas?.width).toBe(100);
    expect(canvas?.height).toBe(50);
    expect(onCanvasCommitted).toHaveBeenCalledWith(canvas, {
      height: 50,
      width: 100,
    });
  });

  it("reports a commit callback failure without failing display", () => {
    stubElementSize(100, 50);
    const context = sharedMockContext();
    const drawImage = vi.spyOn(context, "drawImage");
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const error = new Error("capture failed");

    expect(() =>
      render(
        <BitmapCanvasHost
          bitmap={fakeBitmap(100, 50)}
          onCanvasCommitted={() => {
            throw error;
          }}
        />,
      ),
    ).not.toThrow();

    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(
      "onCanvasCommitted threw; display draw is unaffected",
      error,
    );
  });

  it("closes the replaced bitmap on swap and the committed one on unmount", () => {
    stubElementSize(100, 50);
    const first = fakeBitmap(10, 10);

    const { rerender, unmount } = render(<BitmapCanvasHost bitmap={first} />);
    const second = fakeBitmap(20, 20);
    rerender(<BitmapCanvasHost bitmap={second} />);

    expect(first.close).toHaveBeenCalledTimes(1);
    expect(second.close).not.toHaveBeenCalled();

    unmount();
    expect(second.close).toHaveBeenCalledTimes(1);
  });

  it("re-rendering with the same bitmap neither closes nor redraws it", () => {
    stubElementSize(100, 50);
    const context = sharedMockContext();
    const drawImage = vi.spyOn(context, "drawImage");
    const bitmap = fakeBitmap(10, 10);

    const { rerender } = render(<BitmapCanvasHost bitmap={bitmap} />);
    rerender(<BitmapCanvasHost bitmap={bitmap} />);

    expect(bitmap.close).not.toHaveBeenCalled();
    expect(drawImage).toHaveBeenCalledTimes(1);
  });

  it("skips drawing a detached (closed) bitmap", () => {
    stubElementSize(100, 50);
    const context = sharedMockContext();
    const drawImage = vi.spyOn(context, "drawImage");
    // A closed ImageBitmap reports 0x0; drawing it would throw.
    const detached = fakeBitmap(0, 0);

    render(<BitmapCanvasHost bitmap={detached} />);

    expect(drawImage).not.toHaveBeenCalled();
  });
});

interface FakeBitmap extends ImageBitmap {
  readonly close: Mock<() => void>;
}

function fakeBitmap(width: number, height: number): FakeBitmap {
  return { close: vi.fn(), height, width } as unknown as FakeBitmap;
}

function webpHeader(chunk: "VP8 " | "VP8L" | "VP8X"): Uint8Array {
  const bytes = new Uint8Array(30);
  writeAscii(bytes, 0, "RIFF");
  writeAscii(bytes, 8, "WEBP");
  writeAscii(bytes, 12, chunk);
  return bytes;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  bytes.set(
    [...value].map((character) => character.charCodeAt(0)),
    offset,
  );
}

function writeUint24Le(bytes: Uint8Array, offset: number, value: number): void {
  bytes.set(
    [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff],
    offset,
  );
}

function rawFrame(rgba: readonly number[]): RawImageVisualization {
  return {
    height: 1,
    kind: VISUALIZATION_KIND.RAW_IMAGE,
    rgba: new Uint8Array(rgba),
    sourceEncoding: "rgb8",
    width: 2,
  };
}

function rawFrameWithDimensions(
  rgba: Uint8Array,
  width: number,
  height: number,
): RawImageVisualization {
  return {
    height,
    kind: VISUALIZATION_KIND.RAW_IMAGE,
    rgba,
    sourceEncoding: "rgba8",
    width,
  };
}

function depthFrame(): RawImageVisualization {
  return {
    depth: {
      maxValue: 2_000,
      metersPerUnit: 0.001,
      minValue: 2_000,
      values: new Uint16Array([0, 2_000]),
    },
    height: 1,
    kind: VISUALIZATION_KIND.RAW_IMAGE,
    rgba: new Uint8Array(0),
    sourceEncoding: "16UC1",
    width: 2,
  };
}

function videoFrame(): EncodedVideoVisualization {
  return {
    bytes: Uint8Array.of(0, 0, 1, 0x65),
    codec: "h264",
    format: "h264",
    h264: {
      codecString: "avc1.4D001F",
      hasFrame: true,
      pps: Uint8Array.of(0x68, 0xce),
      sps: Uint8Array.of(0x67, 0x4d, 0x00, 0x1f),
    },
    keyframe: true,
    kind: VISUALIZATION_KIND.ENCODED_VIDEO,
    timestampNs: 1000n,
  };
}

function deltaVideoFrame(): EncodedVideoVisualization {
  return {
    bytes: Uint8Array.of(0, 0, 1, 0x41),
    codec: "h264",
    format: "h264",
    h264: { hasFrame: true },
    keyframe: false,
    kind: VISUALIZATION_KIND.ENCODED_VIDEO,
    timestampNs: 2_000n,
  };
}

function stubVideoDecoder() {
  class FakeEncodedVideoChunk {
    readonly data: BufferSource;
    readonly timestamp: number;
    readonly type: "key" | "delta";

    constructor(init: {
      readonly data: BufferSource;
      readonly timestamp: number;
      readonly type: "key" | "delta";
    }) {
      this.data = init.data;
      this.timestamp = init.timestamp;
      this.type = init.type;
    }
  }

  const instances: FakeVideoDecoder[] = [];
  class FakeVideoDecoder {
    static isConfigSupported = vi.fn(async () => ({ supported: true }));
    readonly close = vi.fn();
    readonly decodeCalls: FakeEncodedVideoChunk[] = [];

    constructor(
      private readonly init: {
        readonly output: (frame: unknown) => void;
      },
    ) {
      instances.push(this);
    }

    configure(): void {
      // no-op in the fake
    }

    decode(chunk: FakeEncodedVideoChunk): void {
      this.decodeCalls.push(chunk);
      this.init.output({
        close: vi.fn(),
        displayHeight: 480,
        displayWidth: 640,
        timestamp: chunk.timestamp,
      });
    }

    reset(): void {
      // no-op in the fake
    }
  }

  vi.stubGlobal("EncodedVideoChunk", FakeEncodedVideoChunk);
  vi.stubGlobal("VideoDecoder", FakeVideoDecoder);
  vi.stubGlobal("isSecureContext", true);
  return { instances };
}

/**
 * Replaces `createImageBitmap` with a queue of deferred decodes so tests
 * control settle order (the out-of-order guard is the point).
 */
function stubCreateImageBitmap() {
  const pending: Array<{
    reject: (error: unknown) => void;
    resolve: (bitmap: ImageBitmap) => void;
  }> = [];
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(
      () =>
        new Promise<ImageBitmap>((resolve, reject) => {
          pending.push({ reject, resolve });
        }),
    ),
  );

  return {
    fail: (index: number, error: unknown) => pending[index].reject(error),
    settle: (index: number, bitmap: ImageBitmap) =>
      pending[index].resolve(bitmap),
  };
}

/** jsdom reports zero-size layout; give the canvas a real CSS size. */
function stubElementSize(width: number, height: number) {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    bottom: height,
    height,
    left: 0,
    right: width,
    toJSON: () => ({}),
    top: 0,
    width,
    x: 0,
    y: 0,
  } as DOMRect);
}

/**
 * The shared vitest setup makes every `getContext` call return one module
 * singleton mock — grabbing it from a scratch canvas lets tests spy on
 * the draws the component performs.
 */
function sharedMockContext(): CanvasRenderingContext2D {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) {
    throw new Error("shared canvas 2d mock missing");
  }
  return context as unknown as CanvasRenderingContext2D;
}
