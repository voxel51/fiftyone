import { getSampleSrc } from "@fiftyone/state/src/recoil/utils";
import { DETECTIONS, HEATMAP } from "@fiftyone/utilities";
import { beforeEach, describe, expect, it, vi } from "vitest";
import decode from ".";
import type { LabelMask } from "../../overlays/base";
import type { Coloring, Colorscale, CustomizeColor } from "../../state";
import { enqueueFetch } from "../pooled-fetch";
import canvas, { recastBufferToMonoChannel } from "./canvas";
import type { IntermediateMask, OverlayMask } from "./types";

vi.mock("@fiftyone/state/src/recoil/utils", () => ({
  getSampleSrc: vi.fn(),
}));

vi.mock("../pooled-fetch", () => ({
  enqueueFetch: vi.fn(),
}));

vi.mock("./canvas", () => ({
  decodeWithCanvas: vi.fn(),
}));

const createOverlayMask = (shape: [number, number]): OverlayMask => {
  return {
    arrayType: "Uint8Array",
    buffer: new ArrayBuffer(shape[0] * shape[1]),
    channels: 1,
    shape,
  };
};

const COLORING = {} as Coloring;
const COLOR_SCALE = {} as Colorscale;
const CUSTOMIZE_COLOR_SETTING: CustomizeColor[] = [];
const SOURCES = {};

const PARAMS = {
  coloring: COLORING,
  colorscale: COLOR_SCALE,
  customizeColorSetting: CUSTOMIZE_COLOR_SETTING,
  sources: SOURCES,
};

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

    await decode({
      cls,
      field,
      label,
      maskPathDecodingPromises,
      ...PARAMS,
    });

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
    const overlayMask = createOverlayMask([100, 200]);

    vi.mocked(getSampleSrc).mockReturnValue(sampleSrcUrl);
    vi.mocked(enqueueFetch).mockResolvedValue({
      blob: () => Promise.resolve(mockBlob),
    } as Response);
    vi.mocked(canvas).mockResolvedValue(overlayMask);

    await decode({
      cls,
      field,
      label,
      maskPathDecodingPromises,
      ...PARAMS,
    });

    expect(getSampleSrc).toHaveBeenCalledWith("/path/to/mask");
    expect(enqueueFetch).toHaveBeenCalledWith({
      url: sampleSrcUrl,
      options: { priority: "low" },
    });
    expect(canvas).toHaveBeenCalledWith(mockBlob);
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
    const overlayMask = createOverlayMask([100, 200]);

    vi.mocked(getSampleSrc).mockReturnValue(sampleSrcUrl);
    vi.mocked(canvas).mockResolvedValue(overlayMask);

    await decode({
      cls,
      field,
      label,
      maskPathDecodingPromises,
      ...PARAMS,
    });

    expect(getSampleSrc).toHaveBeenCalledWith("/path/to/map");
    expect(enqueueFetch).toHaveBeenCalledWith({
      url: sampleSrcUrl,
      options: { priority: "low" },
    });
    expect(canvas).toHaveBeenCalledWith(mockBlob);
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
    const overlayMask1 = createOverlayMask([50, 50]);
    const overlayMask2 = createOverlayMask([60, 60]);

    vi.mocked(getSampleSrc)
      .mockReturnValueOnce(sampleSrcUrl1)
      .mockReturnValueOnce(sampleSrcUrl2);
    vi.mocked(canvas)
      .mockResolvedValueOnce(overlayMask1)
      .mockResolvedValueOnce(overlayMask2);

    await decode({
      cls,
      field,
      label,
      maskPathDecodingPromises,
      ...PARAMS,
    });

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

    await decode({
      cls,
      field,
      label,
      maskPathDecodingPromises,
      ...PARAMS,
    });

    expect(getSampleSrc).toHaveBeenCalledWith("/path/to/mask");
    expect(enqueueFetch).toHaveBeenCalledWith({
      url: sampleSrcUrl,
      options: { priority: "low" },
    });
    expect(canvas).not.toHaveBeenCalled();
    expect(label.mask).toBeNull();
  });
});

describe("recastBufferToMonoChannel", () => {
  it("should handle a single grayscale pixel without alpha (stride=1)", () => {
    const input = new Uint8ClampedArray([128]);
    const width = 1;
    const height = 1;
    const stride = 1;

    const resultBuffer = recastBufferToMonoChannel(
      input,
      width,
      height,
      stride
    );
    const resultArray = new Uint8Array(resultBuffer);

    expect(resultArray).toEqual(new Uint8Array([128]));
  });

  it("should handle stride=4 (e.g., RGBA)", () => {
    // two pixels, each RGBA For example:
    //  pixel 1: R=10, G=10, B=10, A=255
    //  pixel 2: R=40, G=40, B=40, A=255
    const input = new Uint8ClampedArray([10, 10, 10, 255, 40, 40, 40, 255]);
    const width = 2;
    const height = 1;
    const stride = 4;

    const resultBuffer = recastBufferToMonoChannel(
      input,
      width,
      height,
      stride
    );
    const resultArray = new Uint8Array(resultBuffer);
    expect(resultArray).toEqual(new Uint8Array([10, 40]));
  });

  it("should handle stride=3 (e.g., RGB without alpha)", () => {
    // two pixels, each RGB (no alpha). For example:
    //  pixel 1: R=10, G=10, B=10
    //  pixel 2: R=40, G=40, B=40
    const input = new Uint8ClampedArray([10, 10, 10, 40, 40, 40]);
    const width = 2;
    const height = 1;
    const stride = 3;

    const resultBuffer = recastBufferToMonoChannel(
      input,
      width,
      height,
      stride
    );
    const resultArray = new Uint8Array(resultBuffer);
    expect(resultArray).toEqual(new Uint8Array([10, 40]));
  });

  it("should return an empty buffer if width or height is zero", () => {
    const input = new Uint8ClampedArray([1, 2, 3, 4]);
    const width = 0;
    const height = 1;
    const stride = 4;

    const resultBuffer = recastBufferToMonoChannel(
      input,
      width,
      height,
      stride
    );
    const resultArray = new Uint8Array(resultBuffer);

    expect(resultArray.length).toBe(0);
  });
});
