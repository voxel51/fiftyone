/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  SegmentationTool,
  SegmentationToolMode,
  SegmentationToolShape,
} from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useSegmentationMode";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MaskCanvas } from "./MaskCanvas";
import type { Rect } from "../types";
import { maskBounds } from "../utils";

// Stub maskBounds so tests can drive paintEnd's post-stroke crop directly —
// the jsdom canvas mock in vitest.setup.ts has no real pixel storage, so we
// can't compute a tight bbox from painted pixels at runtime. encodeMask is
// stubbed to a known string so tests can observe what onEncoded receives.
/**
 * Controllable stand-in for the shared mask bitmap cache, so decode resolution
 * order can be driven explicitly — the convergence bug only appears when a
 * decode resolves AFTER the source it was started for has been replaced.
 */
const maskCacheStub = vi.hoisted(() => {
  interface Pending {
    bitmap: { close: () => void };
    resolve: () => void;
    promise: Promise<unknown>;
    stored: boolean;
  }

  const pending = new Map<string, Pending>();
  /** Sources handed back, so tests can assert borrows don't leak. */
  const released: string[] = [];

  const decodedOf = (entry: Pending) => ({
    bitmap: entry.bitmap,
    rawPixels: { src: new Uint8Array(4), width: 2, height: 2 },
  });

  return {
    /** Register a decode that will not resolve until `resolve(source)`. */
    enqueue(source: string) {
      let release!: () => void;
      const promise = new Promise<void>((r) => {
        release = r;
      });

      const entry: Pending = {
        bitmap: { close: () => undefined },
        resolve: release,
        promise,
        stored: false,
      };

      pending.set(source, entry);

      return entry.bitmap;
    },

    resolve(source: string) {
      const entry = pending.get(source);
      if (!entry) throw new Error(`nothing enqueued for ${source}`);
      entry.stored = true;
      entry.resolve();
    },

    /** Flush the microtask queue so awaiting code advances. */
    async settle() {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    },

    reset() {
      pending.clear();
      released.length = 0;
    },

    released,

    // ---- the surface MaskCanvas consumes ----
    acquire(source: string) {
      const entry = pending.get(source);
      return entry?.stored ? decodedOf(entry) : undefined;
    },
    async acquireAsync(source: string) {
      const entry = pending.get(source);
      if (!entry) throw new Error(`nothing enqueued for ${source}`);
      await entry.promise;
      return decodedOf(entry);
    },
    release(source: string) {
      released.push(source);
    },
    has(source: string) {
      return pending.get(source)?.stored ?? false;
    },
  };
});

vi.mock("../utils", async () => {
  const actual = await vi.importActual<typeof import("../utils")>("../utils");
  return {
    ...actual,
    maskBounds: vi.fn(),
    encodeMask: vi.fn().mockResolvedValue("encoded-mask"),
    maskBitmapCache: maskCacheStub,
  };
});
const mockedMaskBounds = vi.mocked(maskBounds);

const WHITE = "#ffffff";

/**
 * Returns a small mask canvas already in editing mode, painted white over a
 * given world-space sub-rectangle. Skips the lazy decode path so tests run
 * synchronously against canvas pixels.
 */
const seedCanvas = (bounds: Rect, paintRect: Rect): MaskCanvas => {
  const mc = new MaskCanvas();
  const toolState = {
    active: true,
    tool: SegmentationTool.Select,
    shape: SegmentationToolShape.Circle,
    mode: SegmentationToolMode.Add,
    size: 0,
    cursorSize: 0,
  } satisfies Parameters<MaskCanvas["paintAt"]>[2];
  // A no-op paint dab to force the editing canvas into existence at our bounds.
  mc.paintAt({ x: bounds.x, y: bounds.y }, bounds, toolState, {
    strokeStyle: WHITE,
  });
  // Get the underlying canvas via getPreviewSource and fill the requested
  // sub-rectangle directly (bypasses the line-interpolation and color logic).
  const canvas = mc.getPreviewSource() as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = WHITE;
  ctx.fillRect(
    Math.round(paintRect.x - bounds.x),
    Math.round(paintRect.y - bounds.y),
    Math.round(paintRect.width),
    Math.round(paintRect.height),
  );
  return mc;
};

describe("MaskCanvas decode convergence", () => {
  /** A renderer stub that records what `drawImage` was handed. */
  const recordingRenderer = () => {
    const drawn: unknown[] = [];

    return {
      drawn,
      renderer: {
        drawImage: (image: { bitmap?: unknown; canvas?: unknown }) => {
          drawn.push(image.bitmap ?? image.canvas);
        },
      } as unknown as Parameters<MaskCanvas["render"]>[0],
    };
  };

  const BOUNDS: Rect = { x: 0, y: 0, width: 10, height: 10 };

  const draw = (
    mc: MaskCanvas,
    r: ReturnType<typeof recordingRenderer>,
    onDecoded: () => void = () => {},
  ) => mc.render(r.renderer, BOUNDS, "c", WHITE, 1, onDecoded);

  beforeEach(() => {
    maskCacheStub.reset();
  });

  it("repaints with the current source when a decode resolves stale", async () => {
    maskCacheStub.enqueue("mask-1");
    const second = maskCacheStub.enqueue("mask-2");

    const mc = new MaskCanvas("mask-1");
    const r = recordingRenderer();
    // `onDecoded` is the ONLY repaint trigger (DetectionOverlay wires it to
    // markDirty). Asserting on it — rather than on a render we call ourselves —
    // is what distinguishes converging from sitting stale until an unrelated
    // event happens to repaint.
    const onDecoded = vi.fn();

    draw(mc, r, onDecoded);

    // Playhead advances and settles WHILE mask-1 is still decoding; this render
    // is gated on `decoding` and starts no decode of its own.
    mc.updateSource("mask-2");
    draw(mc, r, onDecoded);

    // mask-1 resolves stale. Without the retry, nothing further happens: no
    // decode for mask-2, and no repaint request ever.
    maskCacheStub.resolve("mask-1");
    await maskCacheStub.settle();
    maskCacheStub.resolve("mask-2");
    await maskCacheStub.settle();

    expect(onDecoded).toHaveBeenCalled();

    // And the repaint it asked for lands on the current frame's mask.
    draw(mc, r, onDecoded);
    expect(r.drawn.at(-1)).toBe(second);
  });

  it("holds the previous mask while the next one decodes", async () => {
    const first = maskCacheStub.enqueue("mask-1");
    maskCacheStub.enqueue("mask-2");

    const mc = new MaskCanvas("mask-1");
    const r = recordingRenderer();

    draw(mc, r);
    maskCacheStub.resolve("mask-1");
    await maskCacheStub.settle();
    draw(mc, r);
    expect(r.drawn.at(-1)).toBe(first);

    // mask-2 is undecoded, so the frame draws mask-1 rather than nothing.
    mc.updateSource("mask-2");
    draw(mc, r);

    expect(r.drawn.at(-1)).toBe(first);
  });

  it("drops the held mask when the source is removed", async () => {
    const first = maskCacheStub.enqueue("mask-1");

    const mc = new MaskCanvas("mask-1");
    const r = recordingRenderer();

    draw(mc, r);
    maskCacheStub.resolve("mask-1");
    await maskCacheStub.settle();
    draw(mc, r);
    expect(r.drawn.at(-1)).toBe(first);

    // No incoming source means nothing will ever converge — unlike a swap,
    // hold-last must not kick in, and the borrow has to go back.
    mc.updateSource(undefined);
    const drawsBefore = r.drawn.length;
    draw(mc, r);

    expect(r.drawn.length).toBe(drawsBefore);
    expect(maskCacheStub.released).toContain("mask-1");
  });
});

describe("MaskCanvas.mergeFrom", () => {
  it("expands bounds to the union of target and source", () => {
    // target at (0,0,10x10) with a small painted square at (0,0,4x4)
    const targetBounds: Rect = { x: 0, y: 0, width: 10, height: 10 };
    const target = seedCanvas(targetBounds, {
      x: 0,
      y: 0,
      width: 4,
      height: 4,
    });

    // source at (8,8,10x10) with a small painted square at (12,12,4x4)
    const sourceBounds: Rect = { x: 8, y: 8, width: 10, height: 10 };
    const source = seedCanvas(sourceBounds, {
      x: 12,
      y: 12,
      width: 4,
      height: 4,
    });

    const sourceCanvas = source.getPreviewSource() as HTMLCanvasElement;
    const newBounds = target.mergeFrom(
      sourceCanvas,
      sourceBounds,
      targetBounds,
    );

    // Union: (0,0) → (18,18). The post-merge crop is a no-op here because
    // the jsdom canvas mock has no real pixel storage — see paintEnd suite
    // below for shrink coverage with maskBounds mocked.
    expect(newBounds.x).toBe(0);
    expect(newBounds.y).toBe(0);
    expect(newBounds.width).toBe(18);
    expect(newBounds.height).toBe(18);
  });

  it("captures pre/post snapshots reachable via getPaintStrokeData", () => {
    const targetBounds: Rect = { x: 0, y: 0, width: 10, height: 10 };
    const target = seedCanvas(targetBounds, {
      x: 0,
      y: 0,
      width: 4,
      height: 4,
    });

    const sourceBounds: Rect = { x: 8, y: 8, width: 10, height: 10 };
    const source = seedCanvas(sourceBounds, {
      x: 12,
      y: 12,
      width: 4,
      height: 4,
    });

    const sourceCanvas = source.getPreviewSource() as HTMLCanvasElement;
    target.mergeFrom(sourceCanvas, sourceBounds, targetBounds);

    const data = target.getPaintStrokeData();
    expect(data.beforeBounds).toEqual(targetBounds);
    expect(data.afterBounds).toBeDefined();
    expect(data.afterBounds?.width).toBeGreaterThan(targetBounds.width);
    expect(data.beforeSnapshot).toBeDefined();
    expect(data.afterSnapshot).toBeDefined();
  });

  it("handles a source fully contained within the target's bounds without expanding", () => {
    const targetBounds: Rect = { x: 0, y: 0, width: 20, height: 20 };
    const target = seedCanvas(targetBounds, {
      x: 0,
      y: 0,
      width: 5,
      height: 5,
    });

    const sourceBounds: Rect = { x: 10, y: 10, width: 5, height: 5 };
    const source = seedCanvas(sourceBounds, {
      x: 10,
      y: 10,
      width: 5,
      height: 5,
    });

    const sourceCanvas = source.getPreviewSource() as HTMLCanvasElement;
    const newBounds = target.mergeFrom(
      sourceCanvas,
      sourceBounds,
      targetBounds,
    );

    // Source is inside target; bounds shouldn't grow. (Crop is a no-op in
    // the mocked canvas env.)
    expect(newBounds.x).toBe(targetBounds.x);
    expect(newBounds.y).toBe(targetBounds.y);
    expect(newBounds.width).toBe(targetBounds.width);
    expect(newBounds.height).toBe(targetBounds.height);
  });
});

describe("MaskCanvas.updateSource guards an in-flight paint encode", () => {
  // Regression: a server-echo reconcile reprojects onto the overlay mid-edit.
  // While a paint encode is still in flight, those canvas pixels are an
  // uncommitted stroke absent from any source, so a reset() would drop them (and
  // abort the encode). Once the encode resolves the pixels live in the source, so
  // a genuine reproject (e.g. undo) must be free to replace the canvas.

  const flushEncode = async (): Promise<void> => {
    // paintEnd's encode chain is then→finally; flush enough microtasks for the
    // finally (which decrements encodingInFlight) to run.
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };

  it("keeps the editing canvas while a paint encode is in flight (returns false)", () => {
    const bounds: Rect = { x: 0, y: 0, width: 10, height: 10 };
    const mc = seedCanvas(bounds, { x: 0, y: 0, width: 4, height: 4 });

    // paintEnd increments encodingInFlight (and rebuilds the canvas); the encode
    // has not resolved yet, so capture the post-paint canvas as the baseline.
    mc.paintEnd(bounds);
    const canvasInFlight = mc.getPreviewSource();
    expect(canvasInFlight).toBeInstanceOf(HTMLCanvasElement);

    expect(mc.updateSource("echoed-serialized-mask")).toBe(false);
    expect(mc.getPreviewSource()).toBe(canvasInFlight);
  });

  it("adopts a new source once the encode has resolved (returns true)", async () => {
    const bounds: Rect = { x: 0, y: 0, width: 10, height: 10 };
    const mc = seedCanvas(bounds, { x: 0, y: 0, width: 4, height: 4 });

    mc.paintEnd(bounds);
    await flushEncode();

    // An undo / genuine reproject carrying a different value must replace the
    // canvas — the earlier over-broad "canvas exists" guard blocked this and left
    // undo restoring bounds but not the mask.
    expect(mc.updateSource("different-mask")).toBe(true);
  });

  it("still swaps the source when there is no editing canvas (returns true)", () => {
    const mc = new MaskCanvas("initial-mask");

    expect(mc.updateSource("different-mask")).toBe(true);
  });
});

describe("MaskCanvas.paintEnd shrink", () => {
  it("snaps bounds down to the painted region reported by maskBounds", () => {
    const bounds: Rect = { x: 0, y: 0, width: 20, height: 20 };
    const mc = seedCanvas(bounds, bounds);

    // Pretend the painted region tight-bounds to pixels (3,4)-(7,8).
    mockedMaskBounds.mockReturnValueOnce({
      minX: 3,
      minY: 4,
      maxX: 7,
      maxY: 8,
    });

    const newBounds = mc.paintEnd(bounds);

    expect(newBounds).toEqual({ x: 3, y: 4, width: 5, height: 5 });
  });

  it("returns bounds unchanged when the canvas is already tight", () => {
    const bounds: Rect = { x: 0, y: 0, width: 5, height: 5 };
    const mc = seedCanvas(bounds, bounds);

    mockedMaskBounds.mockReturnValueOnce({
      minX: 0,
      minY: 0,
      maxX: 4,
      maxY: 4,
    });

    expect(mc.paintEnd(bounds)).toEqual(bounds);
  });

  it("returns bounds unchanged when maskBounds reports no opaque pixels", () => {
    const bounds: Rect = { x: 0, y: 0, width: 10, height: 10 };
    const mc = seedCanvas(bounds, bounds);

    mockedMaskBounds.mockReturnValueOnce(null);

    expect(mc.paintEnd(bounds)).toEqual(bounds);
  });
});

describe("MaskCanvas onEncoded plumbing", () => {
  // Drives DetectionOverlay.maskSource: callers need the freshly encoded mask
  // so a destroy/re-add cycle can rehydrate without depending on a save
  // round-trip back through label.mask.

  it("paintEnd invokes onEncoded with the encoded mask once encode resolves", async () => {
    const bounds: Rect = { x: 0, y: 0, width: 5, height: 5 };
    const mc = seedCanvas(bounds, bounds);
    mockedMaskBounds.mockReturnValueOnce({
      minX: 0,
      minY: 0,
      maxX: 4,
      maxY: 4,
    });

    const onEncoded = vi.fn();
    mc.paintEnd(bounds, onEncoded);

    // Allow the encodeMask Promise to settle.
    await Promise.resolve();
    await Promise.resolve();

    expect(onEncoded).toHaveBeenCalledTimes(1);
    expect(onEncoded).toHaveBeenCalledWith("encoded-mask");
  });

  it("mergeFrom plumbs onEncoded through to paintEnd", async () => {
    const targetBounds: Rect = { x: 0, y: 0, width: 10, height: 10 };
    const target = seedCanvas(targetBounds, {
      x: 0,
      y: 0,
      width: 4,
      height: 4,
    });
    const sourceBounds: Rect = { x: 8, y: 8, width: 10, height: 10 };
    const source = seedCanvas(sourceBounds, {
      x: 12,
      y: 12,
      width: 4,
      height: 4,
    });

    const onEncoded = vi.fn();
    target.mergeFrom(
      source.getPreviewSource() as HTMLCanvasElement,
      sourceBounds,
      targetBounds,
      onEncoded,
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(onEncoded).toHaveBeenCalledWith("encoded-mask");
  });

  it("restoreSnapshot invokes onEncoded after replaying a snapshot", async () => {
    const bounds: Rect = { x: 0, y: 0, width: 5, height: 5 };
    const mc = seedCanvas(bounds, bounds);
    mockedMaskBounds.mockReturnValueOnce({
      minX: 0,
      minY: 0,
      maxX: 4,
      maxY: 4,
    });
    mc.paintEnd(bounds);
    // Wait for the paintEnd encode so the snapshot below has a canvas to
    // capture from; the subsequent restoreSnapshot call is what we're testing.
    await Promise.resolve();
    await Promise.resolve();

    const snapshot = mc.getPaintStrokeData().afterSnapshot;
    expect(snapshot).toBeDefined();

    const onEncoded = vi.fn();
    mc.restoreSnapshot(snapshot, onEncoded);

    await Promise.resolve();
    await Promise.resolve();

    expect(onEncoded).toHaveBeenCalledWith("encoded-mask");
  });

  it("restoreSnapshot(undefined) skips onEncoded (cleared to empty mask)", async () => {
    const bounds: Rect = { x: 0, y: 0, width: 5, height: 5 };
    const mc = seedCanvas(bounds, bounds);
    mockedMaskBounds.mockReturnValueOnce({
      minX: 0,
      minY: 0,
      maxX: 4,
      maxY: 4,
    });
    mc.paintEnd(bounds);
    await Promise.resolve();

    const onEncoded = vi.fn();
    mc.restoreSnapshot(undefined, onEncoded);

    await Promise.resolve();
    await Promise.resolve();

    expect(onEncoded).not.toHaveBeenCalled();
  });
});
