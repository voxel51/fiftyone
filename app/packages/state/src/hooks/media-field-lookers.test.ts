import { describe, expect, it } from "vitest";
import { supportsNativeLooker } from "./media-field-lookers";

const multimodalSample = {
  isDirect3dSample: false,
  sampleMediaType: "multimodal",
};

describe("supportsNativeLooker", () => {
  it.each(["image/webp", "video/mp4"])(
    "uses the native looker for an alternate %s media path",
    (mimeType) => {
      expect(
        supportsNativeLooker({
          ...multimodalSample,
          hasAlternateMediaPath: true,
          mimeType,
        }),
      ).toBe(true);
    },
  );

  it("does not use the native looker for an unsupported alternate path", () => {
    expect(
      supportsNativeLooker({
        ...multimodalSample,
        hasAlternateMediaPath: true,
        mimeType: "application/pdf",
      }),
    ).toBe(false);
  });

  it("keeps the sample media type authoritative for filepath", () => {
    expect(
      supportsNativeLooker({
        ...multimodalSample,
        hasAlternateMediaPath: false,
        mimeType: "application/mcap",
      }),
    ).toBe(false);
  });

  it("falls back to the sample media type when an alternate path is absent", () => {
    expect(
      supportsNativeLooker({
        ...multimodalSample,
        hasAlternateMediaPath: false,
        mimeType: null,
      }),
    ).toBe(false);
  });

  it("supports direct 3D paths selected from alternate fields", () => {
    expect(
      supportsNativeLooker({
        ...multimodalSample,
        hasAlternateMediaPath: true,
        isDirect3dSample: true,
        mimeType: null,
      }),
    ).toBe(true);
  });

  it("does not let a non-media alternate path inherit a native root type", () => {
    expect(
      supportsNativeLooker({
        hasAlternateMediaPath: true,
        isDirect3dSample: false,
        mimeType: "application/json",
        sampleMediaType: "image",
      }),
    ).toBe(false);
  });

  it("lets a selected image override a direct-3D root media type", () => {
    expect(
      supportsNativeLooker({
        hasAlternateMediaPath: true,
        isDirect3dSample: false,
        mimeType: "image/png",
        sampleMediaType: "point-cloud",
      }),
    ).toBe(true);
  });

  it.each(["image", "video"])(
    "preserves the native %s looker for an extensionless alternate path",
    (sampleMediaType) => {
      expect(
        supportsNativeLooker({
          hasAlternateMediaPath: true,
          isDirect3dSample: false,
          mimeType: null,
          sampleMediaType,
        }),
      ).toBe(true);
    },
  );
});
