/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { deserialize } from "@fiftyone/looker/src/numpy";
import { decodeMask } from "./maskDecoding";
import type { MaskDecodeRequest, MaskDecodeResponse } from "./maskDecodeWorker";

/**
 * Real mask from an existing FiftyOne detection (base64-encoded,
 * zlib-compressed numpy uint8 array). Identical to the fixture used by
 * `maskEncoding.test.ts`, so failures here vs. there localize the bug.
 */
const SAMPLE_MASK =
  "eJyb7BfqGxDJyFDGUK2eklqcXKRupaBek2SorqOgnpZfVFKUmBefX5SSChJ3S8wpTgWKF2ckFqQC+RoWhjoKRqaaOgq1CmQCLkZGBuyAEQJwSmDKMmIAnBJQKZIkGIeLBCOdJIaNRwZOgnHkSjAOE4mBDMRBmW2pWCRTTwJnRUE9CdJrKepJ4KwkGZABTglkSQwJqBw2cbAclAYAWfUiKw==";

describe("decodeMask", () => {
  /**
   * jsdom doesn't provide `ImageData` or `createImageBitmap`. Stub both so
   * tests can inspect the RGBA buffer that would have been rasterized.
   */
  type StubImageData = {
    data: Uint8ClampedArray;
    width: number;
    height: number;
  };
  let lastImageData: StubImageData | undefined;

  beforeEach(() => {
    lastImageData = undefined;

    // Force the deterministic main-thread fallback (no real Worker in jsdom).
    vi.stubGlobal("Worker", undefined);

    vi.stubGlobal(
      "ImageData",
      class {
        data: Uint8ClampedArray;
        width: number;
        height: number;
        constructor(data: Uint8ClampedArray, width: number, height: number) {
          this.data = data;
          this.width = width;
          this.height = height;
        }
      },
    );

    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async (data: StubImageData) => {
        lastImageData = data;
        return data as unknown as ImageBitmap;
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("rawPixels normalizes source values for hit-testing", async () => {
    const overlayMask = deserialize(SAMPLE_MASK);
    const [height, width] = overlayMask.shape;

    const { rawPixels } = await decodeMask(SAMPLE_MASK);

    expect(rawPixels.width).toBe(width);
    expect(rawPixels.height).toBe(height);
    expect(rawPixels.src.length).toBe(width * height);
    expect(rawPixels.src).toEqual(
      Uint8Array.from(new Uint8Array(overlayMask.buffer), (value) =>
        value > 0 ? 1 : 0,
      ),
    );
  });

  test("rasterizes non-zero mask pixels as opaque white (color via tint)", async () => {
    await decodeMask(SAMPLE_MASK);

    expect(lastImageData).toBeDefined();
    const { data, width, height } = lastImageData!;
    const overlayMask = deserialize(SAMPLE_MASK);
    const src = new Uint8Array(overlayMask.buffer);

    expect(width).toBe(overlayMask.shape[1]);
    expect(height).toBe(overlayMask.shape[0]);

    let paintedCount = 0;
    let transparentCount = 0;

    for (let i = 0; i < src.length; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const a = data[i * 4 + 3];

      if (src[i] > 0) {
        // Color-independent: opaque white. The display color is applied at
        // draw time via GPU tint, not baked into the bitmap.
        expect(r).toBe(255);
        expect(g).toBe(255);
        expect(b).toBe(255);
        expect(a).toBe(255);
        paintedCount++;
      } else {
        // Background: untouched (zeroed RGBA buffer).
        expect(a).toBe(0);
        transparentCount++;
      }
    }

    // Sanity: the fixture has a mix of mask and background pixels.
    expect(paintedCount).toBeGreaterThan(0);
    expect(transparentCount).toBeGreaterThan(0);
  });

  test("output is color-independent — same white+alpha regardless of input", async () => {
    // decodeMask no longer takes a color; the rasterized bitmap is always
    // white+alpha so the GPU tint can color it. This guards against a
    // regression that reintroduces a color argument / baked color.
    await decodeMask(SAMPLE_MASK);

    expect(lastImageData).toBeDefined();
    const { data } = lastImageData!;
    const overlayMask = deserialize(SAMPLE_MASK);
    const src = new Uint8Array(overlayMask.buffer);

    const paintedIndex = src.findIndex((v) => v > 0);
    expect(paintedIndex).toBeGreaterThanOrEqual(0);

    expect(data[paintedIndex * 4]).toBe(255);
    expect(data[paintedIndex * 4 + 1]).toBe(255);
    expect(data[paintedIndex * 4 + 2]).toBe(255);
    expect(data[paintedIndex * 4 + 3]).toBe(255);
  });

  test("returns a bitmap promise", async () => {
    const { bitmap } = await decodeMask(SAMPLE_MASK);
    expect(bitmap).toBeDefined();
  });
});

describe("decodeMask (worker path)", () => {
  /**
   * Captures postMessage requests and lets tests emit responses/errors, so the
   * dispatcher's request routing, response handling, and crash fallback are
   * exercised without a real Worker (jsdom has none).
   */
  class MockWorker {
    static instances: MockWorker[] = [];

    requests: MaskDecodeRequest[] = [];
    terminate = vi.fn();
    private listeners = new Map<string, Set<(event: unknown) => void>>();

    constructor() {
      MockWorker.instances.push(this);
    }

    addEventListener(type: string, listener: (event: unknown) => void) {
      if (!this.listeners.has(type)) {
        this.listeners.set(type, new Set());
      }
      this.listeners.get(type)!.add(listener);
    }

    postMessage(request: MaskDecodeRequest) {
      this.requests.push(request);
    }

    respond(response: MaskDecodeResponse) {
      this.emit("message", { data: response });
    }

    emit(type: string, event: unknown) {
      for (const listener of this.listeners.get(type) ?? []) {
        listener(event);
      }
    }
  }

  // `maskDecoding` caches its worker in module state, so each test imports a
  // fresh copy to start with no cached instance.
  let decode: typeof decodeMask;

  beforeEach(async () => {
    MockWorker.instances = [];
    vi.stubGlobal("Worker", MockWorker);

    // Stubs for the main-thread fallback path (jsdom lacks both).
    vi.stubGlobal(
      "ImageData",
      class {
        constructor(
          public data: Uint8ClampedArray,
          public width: number,
          public height: number,
        ) {}
      },
    );
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async (data: unknown) => data as ImageBitmap),
    );

    vi.resetModules();
    ({ decodeMask: decode } = await import("./maskDecoding"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("resolves worker responses, routing concurrent requests by uuid", async () => {
    const first = decode(SAMPLE_MASK);
    const second = decode(SAMPLE_MASK);

    const worker = MockWorker.instances[0];
    expect(MockWorker.instances).toHaveLength(1);
    expect(worker.requests).toHaveLength(2);

    const [firstRequest, secondRequest] = worker.requests;
    expect(firstRequest.maskData).toBe(SAMPLE_MASK);

    const firstBitmap = {} as ImageBitmap;
    const secondBitmap = {} as ImageBitmap;

    // Respond out of order to prove uuid routing, not FIFO.
    worker.respond({
      uuid: secondRequest.uuid,
      ok: true,
      bitmap: secondBitmap,
      rawPixels: new Uint8Array([0, 1]),
      width: 2,
      height: 1,
    });
    worker.respond({
      uuid: firstRequest.uuid,
      ok: true,
      bitmap: firstBitmap,
      rawPixels: new Uint8Array([1, 0, 1]),
      width: 3,
      height: 1,
    });

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.bitmap).toBe(firstBitmap);
    expect(firstResult.rawPixels).toEqual({
      src: new Uint8Array([1, 0, 1]),
      width: 3,
      height: 1,
    });
    expect(secondResult.bitmap).toBe(secondBitmap);
    expect(secondResult.rawPixels.width).toBe(2);
  });

  test("falls back to main-thread decode when the worker reports a failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const promise = decode(SAMPLE_MASK);
    const worker = MockWorker.instances[0];
    worker.respond({
      uuid: worker.requests[0].uuid,
      ok: false,
      error: "boom",
    });

    const overlayMask = deserialize(SAMPLE_MASK);
    const result = await promise;
    expect(result.rawPixels.width).toBe(overlayMask.shape[1]);
    expect(result.rawPixels.height).toBe(overlayMask.shape[0]);
    expect(createImageBitmap).toHaveBeenCalled();
  });

  test("worker crash rejects in-flight decodes into the fallback and respawns", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const promise = decode(SAMPLE_MASK);
    const crashed = MockWorker.instances[0];
    crashed.emit("error", new Event("error"));

    // In-flight decode still resolves via the main-thread fallback.
    const result = await promise;
    expect(result.bitmap).toBeDefined();
    expect(crashed.terminate).toHaveBeenCalled();

    // The dead instance was dropped: the next decode spawns a new worker.
    void decode(SAMPLE_MASK);
    expect(MockWorker.instances).toHaveLength(2);
    expect(MockWorker.instances[1].requests).toHaveLength(1);
  });
});
