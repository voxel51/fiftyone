import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  EncodedVideoVisualization,
  RawImageVisualization,
} from "../../decoders";
import { VISUALIZATION_KIND } from "../visualization-registry";
import { imageDisplayRect } from "./base-2d-scene";
import {
  BitmapCanvasHost,
  BitmapImageFrameView,
  BitmapImageView,
  bitmapDrawRect,
} from "./bitmap-image-view";
import { resetVideoTextureDecodersForTests } from "./video-texture";

afterEach(() => {
  cleanup();
  resetVideoTextureDecodersForTests();
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
    // Parity contract with base-2d-scene's imageDisplayRect: the P2 hover
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
});

describe("BitmapImageView", () => {
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

  it("ignores an out-of-order decode that settles after a newer one", async () => {
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

    // Newer decode settles first and commits.
    const newer = fakeBitmap(20, 20);
    decodes.settle(1, newer);
    await waitFor(() => expect(drawImage).toHaveBeenCalledTimes(1));

    // The superseded decode settles late: never committed, closes itself.
    const stale = fakeBitmap(10, 10);
    decodes.settle(0, stale);
    await waitFor(() => expect(stale.close).toHaveBeenCalledTimes(1));

    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawImage).toHaveBeenCalledWith(
      newer,
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(newer.close).not.toHaveBeenCalled();
    expect(onImageLoaded).toHaveBeenCalledTimes(1);
    expect(onImageLoaded).toHaveBeenCalledWith(20, 20);
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

    expect(drawImage).toHaveBeenCalledTimes(2);
    expect(drawImage.mock.calls[0]?.[0]).toMatchObject({
      displayHeight: 480,
      displayWidth: 640,
    });
    expect(drawImage.mock.calls[1]?.[0]).toBeInstanceOf(HTMLCanvasElement);
    expect(drawImage.mock.calls[1]?.slice(1)).toEqual([0, -12.5, 100, 75]);
  });
});

describe("BitmapCanvasHost", () => {
  it("draws a ready bitmap 1:1 when it matches the container size", () => {
    stubElementSize(100, 50);
    const context = sharedMockContext();
    const drawImage = vi.spyOn(context, "drawImage");
    const bitmap = fakeBitmap(100, 50);

    const { container } = render(<BitmapCanvasHost bitmap={bitmap} />);

    // Snapshots are rendered at the cell's CSS pixel size, so cover fit
    // degenerates to an exact 1:1 blit — no crop, no stretch.
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 100, 50);
    const canvas = container.querySelector("canvas");
    expect(canvas?.width).toBe(100);
    expect(canvas?.height).toBe(50);
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
  readonly close: ReturnType<typeof vi.fn>;
}

function fakeBitmap(width: number, height: number): FakeBitmap {
  return { close: vi.fn(), height, width } as unknown as FakeBitmap;
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

function stubVideoDecoder() {
  class FakeEncodedVideoChunk {
    constructor(readonly init: unknown) {}
  }

  class FakeVideoDecoder {
    static isConfigSupported = vi.fn(async () => ({ supported: true }));

    constructor(
      private readonly init: {
        readonly output: (frame: unknown) => void;
      },
    ) {}

    close(): void {
      // no-op in the fake
    }

    configure(): void {
      // no-op in the fake
    }

    decode(): void {
      this.init.output({
        close: vi.fn(),
        displayHeight: 480,
        displayWidth: 640,
      });
    }

    reset(): void {
      // no-op in the fake
    }
  }

  vi.stubGlobal("EncodedVideoChunk", FakeEncodedVideoChunk);
  vi.stubGlobal("VideoDecoder", FakeVideoDecoder);
  vi.stubGlobal("isSecureContext", true);
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
