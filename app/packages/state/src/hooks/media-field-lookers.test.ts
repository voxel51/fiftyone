import { describe, expect, it } from "vitest";
import { supportsNativeLooker } from "./media-field-lookers";

const multimodalSample = {
  sampleMediaType: "multimodal",
  samplePath: "/tmp/episode.mcap",
};

describe("supportsNativeLooker", () => {
  it.each([
    ["image/webp", "/tmp/preview.webp"],
    ["video/mp4", "/tmp/preview.mp4"],
  ])(
    "uses the native looker for an alternate %s media path",
    (mimeType, mediaFieldPath) => {
      expect(
        supportsNativeLooker({
          ...multimodalSample,
          mediaField: "alternate_media",
          mediaFieldPath,
          mimeType,
        }),
      ).toBe(true);
    },
  );

  it("does not use the native looker for an unsupported alternate path", () => {
    expect(
      supportsNativeLooker({
        ...multimodalSample,
        mediaField: "alternate_media",
        mediaFieldPath: "/tmp/preview.pdf",
        mimeType: "application/pdf",
      }),
    ).toBe(false);
  });

  it("keeps the sample media type authoritative for filepath", () => {
    expect(
      supportsNativeLooker({
        ...multimodalSample,
        mediaField: "filepath",
        mediaFieldPath: multimodalSample.samplePath,
        mimeType: "application/mcap",
      }),
    ).toBe(false);
  });

  it("falls back to the sample media type when an alternate path is absent", () => {
    expect(
      supportsNativeLooker({
        ...multimodalSample,
        mediaField: "alternate_media",
        mediaFieldPath: null,
        mimeType: null,
      }),
    ).toBe(false);
  });

  it("supports direct 3D paths selected from alternate fields", () => {
    expect(
      supportsNativeLooker({
        ...multimodalSample,
        mediaField: "alternate_media",
        mediaFieldPath: "/tmp/preview.ply",
        mimeType: null,
      }),
    ).toBe(true);
  });

  it("does not let a non-media alternate path inherit a native root type", () => {
    expect(
      supportsNativeLooker({
        mediaField: "alternate_media",
        mediaFieldPath: "/tmp/notes.json",
        mimeType: "application/json",
        sampleMediaType: "image",
        samplePath: "/tmp/image.png",
      }),
    ).toBe(false);
  });
});
