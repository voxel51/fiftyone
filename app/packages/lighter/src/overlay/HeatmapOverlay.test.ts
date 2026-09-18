/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { OverlayMask } from "@fiftyone/looker/src/numpy";
import type { ColorSchemeInput } from "@fiftyone/relay";
import { beforeEach, describe, expect, it, vi } from "vitest";

const decodeMaskPath = vi.hoisted(() => vi.fn());
vi.mock("../utils/maskPathDecoding", () => ({ decodeMaskPath }));

import type { RenderMeta } from "../types";
import { FAILED_PATH_DECODE_COOLDOWN_MS } from "../utils/pathDecodeCooldown";
import { resolveHeatmapPalette } from "../utils/heatmapPalette";
import { HeatmapOverlay } from "./HeatmapOverlay";

// The test environment mocks a 2D context but provides no `ImageData`
// constructor. What the raster CONTAINS is covered by `heatmapRaster.test.ts`;
// here it only has to be a distinct object per rasterize.
class StubImageData {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
  ) {}
}

vi.stubGlobal("ImageData", StubImageData);

const FIELD = "frames.heatmap";
const SCALE = [
  [0, 0, 0],
  [255, 255, 255],
];

const scheme = (overrides: Partial<ColorSchemeInput> = {}): ColorSchemeInput =>
  ({
    colorPool: ["#ff0000", "#00ff00"],
    colorBy: "field",
    fields: [],
    colorscales: [],
    defaultColorscale: { name: "viridis", list: null, rgb: SCALE },
    ...overrides,
  }) as unknown as ColorSchemeInput;

const palette = (overrides: Partial<ColorSchemeInput> = {}) =>
  resolveHeatmapPalette(FIELD, scheme(overrides), 7, null);

const map = (values: number[]): OverlayMask =>
  ({
    channels: 1,
    arrayType: "Float32Array",
    shape: [2, 2],
    buffer: new Float32Array(values).buffer,
  }) as unknown as OverlayMask;

/** A decoded map standing in for what `decodeMaskPath` returns. */
const mapFixture = () => map([0, 1, 1, 0]);

/**
 * A movable `Date.now`, so the decode cooldown can be stepped over without
 * waiting out real time.
 */
const clock = {
  now: 0,
  advance(ms: number) {
    this.now += ms;
  },
  install() {
    this.now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => this.now);
  },
};

const META: RenderMeta = {
  canonicalMediaBounds: { x: 0, y: 0, width: 100, height: 100 },
};

const makeRenderer = () => ({
  drawImage: vi.fn(),
  beginRebuild: vi.fn(),
  endRebuild: vi.fn(),
  dispose: vi.fn(),
});

const makeOverlay = (values = [0, 0.5, 1, 0.25]) =>
  new HeatmapOverlay({
    id: "heat-1",
    field: FIELD,
    label: { _id: "heat-1", _cls: "Heatmap", map: map(values) },
  });

describe("HeatmapOverlay", () => {
  let renderer: ReturnType<typeof makeRenderer>;

  beforeEach(() => {
    renderer = makeRenderer();
    decodeMaskPath.mockReset();
    vi.restoreAllMocks();
    clock.install();
  });

  const render = (
    overlay: HeatmapOverlay,
    style = { heatmapPalette: palette() },
  ) => overlay.render(renderer as never, style as never, META);

  it("draws the rasterized map over the canonical media bounds", () => {
    render(makeOverlay());

    expect(renderer.drawImage).toHaveBeenCalledTimes(1);
    const [source, bounds] = renderer.drawImage.mock.calls[0];
    expect(source.type).toBe("canvas");
    expect(bounds).toEqual(META.canonicalMediaBounds);
  });

  it("paints nothing until a palette arrives", () => {
    render(makeOverlay(), {} as never);

    expect(renderer.drawImage).not.toHaveBeenCalled();
  });

  it("reuses the raster across repaints of the same map and palette", () => {
    const overlay = makeOverlay();
    const style = { heatmapPalette: palette() };

    render(overlay, style);
    const first = renderer.drawImage.mock.calls[0][0].canvas;
    render(overlay, style);

    expect(renderer.drawImage.mock.calls[1][0].canvas).toBe(first);
  });

  it("re-rasterizes when the palette changes", () => {
    const overlay = makeOverlay();

    render(overlay, { heatmapPalette: palette({ colorBy: "field" }) });
    const first = renderer.drawImage.mock.calls[0][0].canvas;
    render(overlay, { heatmapPalette: palette({ colorBy: "value" }) });

    expect(renderer.drawImage.mock.calls[1][0].canvas).not.toBe(first);
  });

  it("re-rasterizes when the map changes", () => {
    const overlay = makeOverlay([0, 0.5, 1, 0.25]);
    const style = { heatmapPalette: palette() };

    render(overlay, style);
    const first = renderer.drawImage.mock.calls[0][0].canvas;

    overlay.applyLabel({
      _id: "heat-1",
      _cls: "Heatmap",
      map: map([1, 1, 1, 1]),
    });
    render(overlay, style);

    expect(renderer.drawImage.mock.calls[1][0].canvas).not.toBe(first);
  });

  it("hit-tests non-zero values only", () => {
    // 0 is background; a heatmap spans the whole media, so hit-testing its
    // bounds would swallow every click meant for an overlay beneath it
    const overlay = makeOverlay([0, 0.5, 1, 0.25]);
    render(overlay);

    expect(overlay.containsPoint({ x: 0.25, y: 0.25 })).toBe(false);
    expect(overlay.containsPoint({ x: 0.75, y: 0.25 })).toBe(true);
  });

  it("reports the value under a point", () => {
    const overlay = makeOverlay([0, 0.5, 1, 0.25]);
    render(overlay);

    expect(overlay.valueAt({ x: 0.75, y: 0.25 })).toBeCloseTo(0.5);
    expect(overlay.valueAt({ x: 0.25, y: 0.75 })).toBeCloseTo(1);
    expect(overlay.valueAt({ x: 1.5, y: 0.5 })).toBe(0);
  });

  it("survives a map it cannot rasterize", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const overlay = new HeatmapOverlay({
      id: "heat-bad",
      field: FIELD,
      label: {
        _id: "heat-bad",
        _cls: "Heatmap",
        map: {
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

    // and does not retry on every repaint — that would be thirty console
    // errors a second through playback for one bad label
    render(overlay);
    render(overlay);

    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it("decodes an on-disk map through the supplied resolver", async () => {
    const resolveUrl = vi.fn(() => "/media?filepath=/m.png");
    decodeMaskPath.mockResolvedValue(mapFixture());

    const overlay = new HeatmapOverlay({
      id: "heatmap-disk",
      field: FIELD,
      label: { _id: "d", _cls: "Heatmap", map_path: "/m.png" },
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

    const overlay = new HeatmapOverlay({
      id: "heatmap-inflight",
      field: FIELD,
      label: { _id: "d", _cls: "Heatmap", map_path: "/m.png" },
      resolveUrl: () => "/media?filepath=/m.png",
    });

    // every frame of playback repaints; each must not fire its own fetch
    render(overlay);
    render(overlay);
    render(overlay);

    expect(decodeMaskPath).toHaveBeenCalledTimes(1);

    resolveDecode(mapFixture());
  });

  it("discards a decode whose label has moved on", async () => {
    // a scrub, or simply the next frame: adopting a stale decode would paint
    // one frame's map over another
    let resolveDecode: (value: unknown) => void = () => undefined;
    decodeMaskPath.mockReturnValue(
      new Promise((resolve) => {
        resolveDecode = resolve;
      }),
    );

    const overlay = new HeatmapOverlay({
      id: "heatmap-stale",
      field: FIELD,
      label: { _id: "d", _cls: "Heatmap", map_path: "/old.png" },
      resolveUrl: () => "/media?filepath=/old.png",
    });

    render(overlay);

    overlay.applyLabel({
      _id: "d",
      _cls: "Heatmap",
      map_path: "/new.png",
    });

    resolveDecode(mapFixture());
    await Promise.resolve();

    renderer.drawImage.mockClear();
    render(overlay);

    // the stale decode must not have been adopted for the new path
    expect(renderer.drawImage).not.toHaveBeenCalled();
  });

  it("retries after a failed decode instead of giving up for good", async () => {
    // `decodeMaskPath` returns undefined on failure and caches nothing, so
    // pinning the path to that result would mean a transient network error
    // hides the map for the rest of the clip
    decodeMaskPath.mockResolvedValueOnce(undefined);

    const overlay = new HeatmapOverlay({
      id: "heatmap-retry",
      field: FIELD,
      label: { _id: "d", _cls: "Heatmap", map_path: "/m.png" },
      resolveUrl: () => "/media?filepath=/m.png",
    });

    render(overlay);
    await Promise.resolve();
    await Promise.resolve();

    expect(renderer.drawImage).not.toHaveBeenCalled();

    decodeMaskPath.mockResolvedValue(mapFixture());

    // The retry is held off briefly, so repaints inside the cooldown must not
    // each start another fetch.
    render(overlay);
    render(overlay);
    expect(decodeMaskPath).toHaveBeenCalledTimes(1);

    clock.advance(FAILED_PATH_DECODE_COOLDOWN_MS);

    render(overlay);
    await vi.waitFor(() => expect(overlay.getIsDirty()).toBe(true));
    render(overlay);

    expect(decodeMaskPath).toHaveBeenCalledTimes(2);
    expect(renderer.drawImage).toHaveBeenCalled();
  });

  it("drops a decode that lands after the overlay is destroyed", async () => {
    let settle: (value: unknown) => void = () => undefined;
    decodeMaskPath.mockReturnValueOnce(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );

    const overlay = new HeatmapOverlay({
      id: "heatmap-retry-destroyed",
      field: FIELD,
      label: { _id: "d", _cls: "Heatmap", map_path: "/m.png" } as never,
      resolveUrl: () => "/media?filepath=/m.png",
    });

    render(overlay);
    overlay.destroy();

    // The fetch outlives the overlay; adopting its result would mark a
    // disposed overlay dirty and schedule a render against a gone renderer.
    settle(mapFixture());
    await Promise.resolve();
    await Promise.resolve();

    expect(overlay.getIsDirty()).toBe(false);
  });

  it("stops answering hit tests once the inline map is gone", () => {
    const overlay = makeOverlay();

    render(overlay);
    expect(overlay.valueAt({ x: 0.75, y: 0.25 })).toBe(0.5);
    expect(overlay.containsPoint({ x: 0.75, y: 0.25 })).toBe(true);

    // The label keeps its identity but moves its map to disk. The overlay can
    // no longer paint it, so it must not keep swallowing clicks for the raster
    // it used to have.
    overlay.applyLabel({
      _id: "heat-1",
      _cls: "Heatmap",
      map_path: "/m.png",
    } as never);
    render(overlay);

    expect(overlay.valueAt({ x: 0.75, y: 0.25 })).toBe(0);
    expect(overlay.containsPoint({ x: 0.75, y: 0.25 })).toBe(false);
  });

  it("retries a map that failed under a different map of the same length", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const bad = {
      channels: 2,
      arrayType: "Float32Array",
      shape: [2, 2],
      buffer: new Float32Array([0, 1, 2, 3]).buffer,
    } as unknown as OverlayMask;

    const overlay = new HeatmapOverlay({
      id: "heat-retry",
      field: FIELD,
      label: { _id: "heat-retry", _cls: "Heatmap", map: bad } as never,
    });

    render(overlay);
    expect(renderer.drawImage).not.toHaveBeenCalled();

    // A different map object, same palette: the failure belonged to the old
    // one, so this must be rasterized rather than suppressed.
    overlay.applyLabel({
      _id: "heat-retry",
      _cls: "Heatmap",
      map: map([0, 0.5, 1, 0.25]),
    } as never);
    render(overlay);

    expect(renderer.drawImage).toHaveBeenCalledTimes(1);
  });

  it("says so once when no resolver was supplied", () => {
    const consoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    const overlay = new HeatmapOverlay({
      id: "heatmap-noresolver",
      field: FIELD,
      label: { _id: "d", _cls: "Heatmap", map_path: "/m.png" },
    });

    render(overlay);
    render(overlay);

    expect(renderer.drawImage).not.toHaveBeenCalled();
    // a per-frame warning would flood the console during playback
    expect(consoleWarn).toHaveBeenCalledTimes(1);
  });
});
