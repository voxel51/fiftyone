import { getSampleSrc } from "@fiftyone/state/src/recoil/utils";
import { DETECTIONS, HEATMAP } from "@fiftyone/utilities";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Coloring, CustomizeColor } from "..";
import { LabelMask } from "../overlays/base";
import type { Colorscale } from "../state";
import { decodeWithCanvas } from "./canvas-decoder";
import { decodeOverlayOnDisk, IntermediateMask } from "./disk-overlay-decoder";
import { enqueueFetch } from "./pooled-fetch";

vi.mock("@fiftyone/state/src/recoil/utils", () => ({
  getSampleSrc: vi.fn(),
}));

vi.mock("./pooled-fetch", () => ({
  enqueueFetch: vi.fn(),
}));

vi.mock("./canvas-decoder", () => ({
  decodeWithCanvas: vi.fn(),
}));

const COLORING = {} as Coloring;
const COLOR_SCALE = {} as Colorscale;
const CUSTOMIZE_COLOR_SETTING: CustomizeColor[] = [];
const SOURCES = {};

type MaskUnion = (IntermediateMask & LabelMask) | null;

describe("decodeOverlayOnDisk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return early if label already has overlay field (not on disk)", async () => {
    const field = "testField";
    const label = { mask: {}, mask_path: "shouldBeIgnored" };
    const cls = "Segmentation";
    const maskPathDecodingPromises: Promise<void>[] = [];

    await decodeOverlayOnDisk(
      field,
      label,
      COLORING,
      CUSTOMIZE_COLOR_SETTING,
      COLOR_SCALE,
      SOURCES,
      cls,
      maskPathDecodingPromises
    );

    expect(label.mask).toBeDefined();
    expect(enqueueFetch).not.toHaveBeenCalled();
  });

  it("should fetch and decode overlay when label has overlay path field", async () => {
    const field = "testField";
    const label = { mask_path: "/path/to/mask", mask: null as MaskUnion };
    const cls = "Segmentation";
    const maskPathDecodingPromises: Promise<void>[] = [];

    const sampleSrcUrl = "http://example.com/path/to/mask";
    const mockBlob = new Blob(["mock data"], { type: "image/png" });
    const overlayMask = { shape: [100, 200] };

    vi.mocked(getSampleSrc).mockReturnValue(sampleSrcUrl);
    vi.mocked(enqueueFetch).mockResolvedValue({
      blob: () => Promise.resolve(mockBlob),
    } as Response);
    vi.mocked(decodeWithCanvas).mockResolvedValue(overlayMask);

    await decodeOverlayOnDisk(
      field,
      label,
      COLORING,
      CUSTOMIZE_COLOR_SETTING,
      COLOR_SCALE,
      SOURCES,
      cls,
      maskPathDecodingPromises
    );

    expect(getSampleSrc).toHaveBeenCalledWith("/path/to/mask");
    expect(enqueueFetch).toHaveBeenCalledWith({
      url: sampleSrcUrl,
      options: { priority: "low" },
    });
    expect(decodeWithCanvas).toHaveBeenCalledWith(mockBlob);
    expect(label.mask).toBeDefined();
    expect(label.mask.data).toBe(overlayMask);
    expect(label.mask.image).toBeInstanceOf(ArrayBuffer);
    expect(label.mask.image.byteLength).toBe(100 * 200 * 4);
  });

  it("should handle HEATMAP class", async () => {
    const field = "testField";
    const label = { map_path: "/path/to/map", map: null as MaskUnion };
    const cls = HEATMAP;
    const maskPathDecodingPromises: Promise<void>[] = [];

    const sampleSrcUrl = "http://example.com/path/to/map";
    const mockBlob = new Blob(["mock data"], { type: "image/png" });
    const overlayMask = { shape: [100, 200] };

    vi.mocked(getSampleSrc).mockReturnValue(sampleSrcUrl);
    vi.mocked(decodeWithCanvas).mockResolvedValue(overlayMask);

    await decodeOverlayOnDisk(
      field,
      label,
      COLORING,
      CUSTOMIZE_COLOR_SETTING,
      COLOR_SCALE,
      SOURCES,
      cls,
      maskPathDecodingPromises
    );

    expect(getSampleSrc).toHaveBeenCalledWith("/path/to/map");
    expect(enqueueFetch).toHaveBeenCalledWith({
      url: sampleSrcUrl,
      options: { priority: "low" },
    });
    expect(decodeWithCanvas).toHaveBeenCalledWith(mockBlob);
    expect(label.map).toBeDefined();
    expect(label.map.data).toBe(overlayMask);
    expect(label.map.image).toBeInstanceOf(ArrayBuffer);
    expect(label.map.image.byteLength).toBe(100 * 200 * 4);
  });

  it("should handle DETECTIONS class and process detections recursively", async () => {
    const field = "testField";
    const label = {
      detections: [
        { mask_path: "/path/to/mask1", mask: null as MaskUnion },
        { mask_path: "/path/to/mask2", mask: null as MaskUnion },
      ],
    };
    const cls = DETECTIONS;
    const maskPathDecodingPromises: Promise<void>[] = [];

    const sampleSrcUrl1 = "http://example.com/path/to/mask1";
    const sampleSrcUrl2 = "http://example.com/path/to/mask2";
    const overlayMask1 = { shape: [50, 50] };
    const overlayMask2 = { shape: [60, 60] };

    vi.mocked(getSampleSrc)
      .mockReturnValueOnce(sampleSrcUrl1)
      .mockReturnValueOnce(sampleSrcUrl2);
    vi.mocked(decodeWithCanvas)
      .mockResolvedValueOnce(overlayMask1)
      .mockResolvedValueOnce(overlayMask2);

    await decodeOverlayOnDisk(
      field,
      label,
      COLORING,
      CUSTOMIZE_COLOR_SETTING,
      COLOR_SCALE,
      SOURCES,
      cls,
      maskPathDecodingPromises
    );

    await Promise.all(maskPathDecodingPromises);

    expect(getSampleSrc).toHaveBeenNthCalledWith(1, "/path/to/mask1");
    expect(getSampleSrc).toHaveBeenNthCalledWith(2, "/path/to/mask2");
    expect(label.detections[0].mask).toBeDefined();
    expect(label.detections[0].mask.data).toBe(overlayMask1);
    expect(label.detections[1].mask).toBeDefined();
    expect(label.detections[1].mask.data).toBe(overlayMask2);
  });

  it("should return early if fetch (with retry) fails", async () => {
    const field = "testField";
    const label = { mask_path: "/path/to/mask", mask: null as MaskUnion };
    const cls = "Segmentation";
    const maskPathDecodingPromises: Promise<void>[] = [];

    const sampleSrcUrl = "http://example.com/path/to/mask";

    vi.mocked(getSampleSrc).mockReturnValue(sampleSrcUrl);
    vi.mocked(enqueueFetch).mockRejectedValue(new Error("Fetch failed"));

    await decodeOverlayOnDisk(
      field,
      label,
      COLORING,
      CUSTOMIZE_COLOR_SETTING,
      COLOR_SCALE,
      SOURCES,
      cls,
      maskPathDecodingPromises
    );

    expect(getSampleSrc).toHaveBeenCalledWith("/path/to/mask");
    expect(enqueueFetch).toHaveBeenCalledWith({
      url: sampleSrcUrl,
      options: { priority: "low" },
    });
    expect(decodeWithCanvas).not.toHaveBeenCalled();
    expect(label.mask).toBeNull();
  });
});
