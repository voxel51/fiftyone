/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { OverlayMask } from "@fiftyone/looker/src/numpy";
import type { ColorSchemeInput } from "@fiftyone/relay";
import { beforeEach, describe, expect, it, vi } from "vitest";

const decodeMaskPath = vi.hoisted(() => vi.fn());
vi.mock("../utils/maskPathDecoding", () => ({ decodeMaskPath }));

import { LABEL_ARCHETYPE_PRIORITY } from "../constants";
import type { RenderMeta } from "../types";
import { resolveSegmentationPalette } from "../utils/segmentationPalette";
import { SegmentationOverlay } from "./SegmentationOverlay";

// The test environment mocks a 2D context but provides no `ImageData`
// constructor. What the raster CONTAINS is covered by
// `segmentationRaster.test.ts`; here it only has to be a distinct object per
// rasterize, so the overlay's caching and draw behavior can be observed.
class StubImageData {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
  ) {}
}

vi.stubGlobal("ImageData", StubImageData);

const POOL = ["#ff0000", "#00ff00", "#0000ff", "#ffff00"];
const FIELD = "frames.segmentation";
const TARGETS = { 0: "background", 1: "sky", 2: "road" };

const scheme = (overrides: Partial<ColorSchemeInput> = {}): ColorSchemeInput =>
  ({
    colorPool: POOL,
    colorBy: "value",
    fields: [],
    ...overrides,
  }) as ColorSchemeInput;

const palette = (overrides: Partial<ColorSchemeInput> = {}) =>
  resolveSegmentationPalette(FIELD, scheme(overrides), 7, TARGETS);

/** 2x2 single-channel mask. */
const mask = (values: number[]): OverlayMask =>
  ({
    channels: 1,
    arrayType: "Uint8Array",
    shape: [2, 2],
    buffer: new Uint8Array(values).buffer,
  }) as unknown as OverlayMask;

/** A decoded mask standing in for what `decodeMaskPath` returns. */
const maskFixture = () => mask([0, 1, 1, 0]);

const META: RenderMeta = {
  canonicalMediaBounds: { x: 0, y: 0, width: 100, height: 100 },
};

const makeRenderer = () => ({
  drawImage: vi.fn(),
  drawRect: vi.fn(),
  beginRebuild: vi.fn(),
  endRebuild: vi.fn(),
  dispose: vi.fn(),
});

const makeOverlay = (values = [0, 1, 2, 1]) =>
  new SegmentationOverlay({
    id: "seg-1",
    field: FIELD,
    label: { _id: "seg-1", _cls: "Segmentation", mask: mask(values) },
  });

describe("SegmentationOverlay", () => {
  let renderer: ReturnType<typeof makeRenderer>;

  beforeEach(() => {
    renderer = makeRenderer();
    decodeMaskPath.mockReset();
    vi.restoreAllMocks();
  });

  const render = (
    overlay: SegmentationOverlay,
    style = { segmentationPalette: palette() },
  ) => overlay.render(renderer as never, style as never, META);

  it("draws the rasterized mask over the canonical media bounds", () => {
    render(makeOverlay());

    expect(renderer.drawImage).toHaveBeenCalledTimes(1);
    const [source, bounds] = renderer.drawImage.mock.calls[0];
    expect(source.type).toBe("canvas");
    expect(bounds).toEqual(META.canonicalMediaBounds);
  });

  it("paints nothing until a palette arrives", () => {
    // the color context lands on its own effect; an uncolored mask would
    // flash a wrong-colored sheet over the media
    render(makeOverlay(), {} as never);

    expect(renderer.drawImage).not.toHaveBeenCalled();
  });

  it("reuses the raster across repaints of the same mask and palette", () => {
    const overlay = makeOverlay();
    const style = { segmentationPalette: palette() };

    render(overlay, style);
    const first = renderer.drawImage.mock.calls[0][0].canvas;

    render(overlay, style);
    const second = renderer.drawImage.mock.calls[1][0].canvas;

    // re-rasterizing per paint would redo a megapixel loop every frame
    expect(second).toBe(first);
  });

  it("re-rasterizes when the palette changes", () => {
    const overlay = makeOverlay();

    render(overlay, { segmentationPalette: palette({ colorBy: "value" }) });
    const first = renderer.drawImage.mock.calls[0][0].canvas;

    render(overlay, { segmentationPalette: palette({ colorBy: "field" }) });
    const second = renderer.drawImage.mock.calls[1][0].canvas;

    expect(second).not.toBe(first);
  });

  it("re-rasterizes when the mask changes", () => {
    const overlay = makeOverlay([0, 1, 2, 1]);
    const style = { segmentationPalette: palette() };

    render(overlay, style);
    const first = renderer.drawImage.mock.calls[0][0].canvas;

    overlay.applyLabel({
      _id: "seg-1",
      _cls: "Segmentation",
      mask: mask([2, 2, 2, 2]),
    });
    render(overlay, style);

    expect(renderer.drawImage.mock.calls[1][0].canvas).not.toBe(first);
  });

  it("hit-tests painted pixels only", () => {
    // a segmentation covers the whole media; reporting its bounds as its hit
    // area would swallow every click meant for an overlay beneath it
    const overlay = makeOverlay([0, 1, 2, 1]);
    render(overlay);

    expect(overlay.containsPoint({ x: 0.25, y: 0.25 })).toBe(false);
    expect(overlay.containsPoint({ x: 0.75, y: 0.25 })).toBe(true);
  });

  it("reports the target index under a point", () => {
    const overlay = makeOverlay([0, 1, 2, 1]);
    render(overlay);

    expect(overlay.targetAt({ x: 0.25, y: 0.25 })).toBe(0);
    expect(overlay.targetAt({ x: 0.75, y: 0.25 })).toBe(1);
    expect(overlay.targetAt({ x: 0.25, y: 0.75 })).toBe(2);
  });

  it("reports no target outside the mask", () => {
    const overlay = makeOverlay();
    render(overlay);

    expect(overlay.targetAt({ x: -0.1, y: 0.5 })).toBe(0);
    expect(overlay.targetAt({ x: 1.5, y: 0.5 })).toBe(0);
  });

  it("survives a mask it cannot rasterize", () => {
    // one bad mask must not take down the frame — every other overlay in the
    // pass still has to paint
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const overlay = new SegmentationOverlay({
      id: "seg-bad",
      field: FIELD,
      label: {
        _id: "seg-bad",
        _cls: "Segmentation",
        mask: {
          channels: 3,
          arrayType: "Uint8Array",
          shape: [1, 1],
          buffer: new Uint8Array([1, 2, 3]).buffer,
        } as unknown as OverlayMask,
      },
    });

    expect(() => render(overlay)).not.toThrow();
    expect(renderer.drawImage).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledTimes(1);

    // and does not retry it on every repaint: the reuse check needs a canvas,
    // which a failure leaves unset, so without a failure memo this would log
    // thirty times a second through playback
    render(overlay);
    render(overlay);

    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it("decodes an on-disk mask through the supplied resolver", async () => {
    const resolveUrl = vi.fn(() => "/media?filepath=/m.png");
    decodeMaskPath.mockResolvedValue(maskFixture());

    const overlay = new SegmentationOverlay({
      id: "segmentation-disk",
      field: FIELD,
      label: { _id: "d", _cls: "Segmentation", mask_path: "/m.png" },
      resolveUrl,
    });

    // the first paint has nothing yet: the decode is asynchronous
    render(overlay);
    expect(renderer.drawImage).not.toHaveBeenCalled();
    expect(resolveUrl).toHaveBeenCalledWith("/m.png");

    await vi.waitFor(() => expect(overlay.getIsDirty()).toBe(true));

    render(overlay);
    expect(renderer.drawImage).toHaveBeenCalledTimes(1);
  });

  it("does not restart a decode already in flight", async () => {
    let resolveDecode: (value: unknown) => void = () => undefined;
    decodeMaskPath.mockReturnValue(
      new Promise((resolve) => {
        resolveDecode = resolve;
      }),
    );

    const overlay = new SegmentationOverlay({
      id: "segmentation-inflight",
      field: FIELD,
      label: { _id: "d", _cls: "Segmentation", mask_path: "/m.png" },
      resolveUrl: () => "/media?filepath=/m.png",
    });

    // every frame of playback repaints; each must not fire its own fetch
    render(overlay);
    render(overlay);
    render(overlay);

    expect(decodeMaskPath).toHaveBeenCalledTimes(1);

    resolveDecode(maskFixture());
  });

  it("discards a decode whose label has moved on", async () => {
    // a scrub, or simply the next frame: adopting a stale decode would paint
    // one frame's mask over another
    let resolveDecode: (value: unknown) => void = () => undefined;
    decodeMaskPath.mockReturnValue(
      new Promise((resolve) => {
        resolveDecode = resolve;
      }),
    );

    const overlay = new SegmentationOverlay({
      id: "segmentation-stale",
      field: FIELD,
      label: { _id: "d", _cls: "Segmentation", mask_path: "/old.png" },
      resolveUrl: () => "/media?filepath=/old.png",
    });

    render(overlay);

    overlay.applyLabel({
      _id: "d",
      _cls: "Segmentation",
      mask_path: "/new.png",
    });

    resolveDecode(maskFixture());
    await Promise.resolve();

    renderer.drawImage.mockClear();
    render(overlay);

    // the stale decode must not have been adopted for the new path
    expect(renderer.drawImage).not.toHaveBeenCalled();
  });

  it("retries after a failed decode instead of giving up for good", async () => {
    // `decodeMaskPath` returns undefined on failure and caches nothing, so
    // pinning the path to that result would mean a transient network error
    // hides the mask for the rest of the clip
    decodeMaskPath.mockResolvedValueOnce(undefined);

    const overlay = new SegmentationOverlay({
      id: "segmentation-retry",
      field: FIELD,
      label: { _id: "d", _cls: "Segmentation", mask_path: "/m.png" },
      resolveUrl: () => "/media?filepath=/m.png",
    });

    render(overlay);
    await Promise.resolve();
    await Promise.resolve();

    expect(renderer.drawImage).not.toHaveBeenCalled();

    decodeMaskPath.mockResolvedValue(maskFixture());

    render(overlay);
    await vi.waitFor(() => expect(overlay.getIsDirty()).toBe(true));
    render(overlay);

    expect(decodeMaskPath).toHaveBeenCalledTimes(2);
    expect(renderer.drawImage).toHaveBeenCalled();
  });

  describe("selection", () => {
    it("draws no outline when unselected", () => {
      const overlay = makeOverlay();
      render(overlay);

      expect(renderer.drawRect).not.toHaveBeenCalled();
    });

    it("outlines the media when selected", () => {
      // a mask covers the whole frame and has no shape of its own, so the
      // media rect is the only honest boundary to draw
      const overlay = makeOverlay();
      overlay.setSelected(true);
      render(overlay);

      expect(renderer.drawRect).toHaveBeenCalled();
      const [bounds] = renderer.drawRect.mock.calls[0];
      expect(bounds).toEqual(META.canonicalMediaBounds);
    });

    it("draws a solid stroke under a dashed one", () => {
      const overlay = makeOverlay();
      overlay.setSelected(true);
      render(overlay);

      const [, solid] = renderer.drawRect.mock.calls[0];
      const [, dashed] = renderer.drawRect.mock.calls[1];

      expect(solid.dashPattern).toBeUndefined();
      expect(dashed.dashPattern?.length).toBeGreaterThan(0);
      expect(dashed.strokeStyle).not.toBe(solid.strokeStyle);
    });

    it("repaints when selection changes", () => {
      // the outline is part of the paint, so a clean overlay would keep the
      // stale one
      const overlay = makeOverlay();
      render(overlay);
      overlay.markClean();

      overlay.setSelected(true);

      expect(overlay.getIsDirty()).toBe(true);
    });

    it("does not repaint when the selection state is unchanged", () => {
      const overlay = makeOverlay();
      overlay.setSelected(true);
      render(overlay);
      overlay.markClean();

      overlay.setSelected(true);

      expect(overlay.getIsDirty()).toBe(false);
    });

    it("toggles", () => {
      const overlay = makeOverlay();

      expect(overlay.toggleSelected()).toBe(true);
      expect(overlay.isSelected()).toBe(true);
      expect(overlay.toggleSelected()).toBe(false);
      expect(overlay.isSelected()).toBe(false);
    });

    it("ranks below every bounded label, and above the media", () => {
      // it covers the whole frame, so a click inside a box that happens to
      // lie over it has to reach the box
      const overlay = makeOverlay();

      expect(overlay.getSelectionPriority()).toBe(
        LABEL_ARCHETYPE_PRIORITY.SEGMENTATION,
      );
      expect(overlay.getSelectionPriority()).toBeLessThan(
        LABEL_ARCHETYPE_PRIORITY.BOUNDING_BOX,
      );
      expect(overlay.getSelectionPriority()).toBeGreaterThan(
        LABEL_ARCHETYPE_PRIORITY.IMAGE,
      );
    });
  });

  it("says so once when no resolver was supplied", () => {
    const consoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    const overlay = new SegmentationOverlay({
      id: "segmentation-noresolver",
      field: FIELD,
      label: { _id: "d", _cls: "Segmentation", mask_path: "/m.png" },
    });

    render(overlay);
    render(overlay);

    expect(renderer.drawImage).not.toHaveBeenCalled();
    // a per-frame warning would flood the console during playback
    expect(consoleWarn).toHaveBeenCalledTimes(1);
  });
});
