import { describe, expect, it } from "vitest";
import {
  resolveMediaFieldLooker,
  supportsNativeLooker,
} from "./media-field-lookers";

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

describe("resolveMediaFieldLooker", () => {
  const sample = {
    filepath: "/tmp/episode.mcap",
    metadata: { mime_type: "application/mcap" },
    media_type: "multimodal",
  };
  const urls = {
    filepath: "/media?filepath=%2Ftmp%2Fepisode.mcap",
    thumbnail_path: "/media?filepath=%2Ftmp%2Fpreview.png",
    video_path: "/media?filepath=%2Ftmp%2Fpreview.mp4",
  };

  it("keeps the MCAP filepath on the custom-renderer path", () => {
    expect(
      resolveMediaFieldLooker({ mediaField: "filepath", sample, urls }),
    ).toMatchObject({
      hasAlternateMediaPath: false,
      mimeType: "application/mcap",
      nativeLookerType: null,
      selectedMediaPath: urls.filepath,
    });
  });

  it("keeps a logical media reference off all native looker paths", () => {
    expect(
      resolveMediaFieldLooker({
        mediaField: "media_reference",
        sample: {
          media_reference: {
            kind: "lerobot-episode",
            key: "source:17",
          },
          _media_type: "multimodal",
        },
        urls: {},
      }),
    ).toMatchObject({
      hasMediaReference: true,
      nativeLookerType: null,
      selectedMediaPath: null,
    });
  });

  it("routes an alternate image from a multimodal sample to ImageLooker", () => {
    expect(
      resolveMediaFieldLooker({
        mediaField: "thumbnail_path",
        sample,
        urls,
      }),
    ).toMatchObject({
      hasAlternateMediaPath: true,
      mimeType: "image/png",
      nativeLookerType: "image",
      selectedMediaPath: urls.thumbnail_path,
    });
  });

  it("routes an alternate video from a multimodal sample to VideoLooker", () => {
    expect(
      resolveMediaFieldLooker({ mediaField: "video_path", sample, urls }),
    ).toMatchObject({
      hasAlternateMediaPath: true,
      mimeType: "video/mp4",
      nativeLookerType: "video",
      selectedMediaPath: urls.video_path,
    });
  });
});
