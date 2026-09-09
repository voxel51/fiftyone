import { describe, expect, it } from "vitest";

import {
  unsupportedSourceFormatReason,
  unsupportedVideoFormatReason,
  videoCodecFromFormat,
  videoRenderingUnsupportedReason,
} from "./video-format";

describe("video format helpers", () => {
  it("normalizes exact and prefixed codec identifiers", () => {
    expect(videoCodecFromFormat("h264")).toBe("h264");
    expect(videoCodecFromFormat("H.264")).toBe("h264");
    expect(videoCodecFromFormat("avc")).toBe("h264");
    expect(videoCodecFromFormat("avc1.4d001f")).toBe("h264");
    expect(videoCodecFromFormat("avc3.64001f")).toBe("h264");
    expect(videoCodecFromFormat("h265")).toBe("h265");
    expect(videoCodecFromFormat("hevc")).toBe("h265");
    expect(videoCodecFromFormat("hev1.1.6.l93.b0")).toBe("h265");
    expect(videoCodecFromFormat("hvc1.1.6.l93.b0")).toBe("h265");
    expect(videoCodecFromFormat("vp9")).toBe("vp9");
    expect(videoCodecFromFormat("vp09.00.10.08")).toBe("vp9");
    expect(videoCodecFromFormat("av1")).toBe("av1");
    expect(videoCodecFromFormat("av01.0.05m.08")).toBe("av1");
  });

  it("finds codecs in source format strings", () => {
    expect(videoCodecFromFormat("bgr8; h264 compressed")).toBe("h264");
    expect(
      videoCodecFromFormat('video/mp4; codecs="mp4a.40.2, avc1.4d001f"'),
    ).toBe("h264");
    expect(videoCodecFromFormat("image/jpeg")).toBeNull();
    expect(videoCodecFromFormat("   ")).toBeNull();
  });

  it("formats unsupported codec and source-format reasons", () => {
    expect(videoRenderingUnsupportedReason("vp09.00.10.08")).toBe(
      "VP9 video rendering not yet supported",
    );
    expect(videoRenderingUnsupportedReason("image/jpeg")).toBeUndefined();
    expect(unsupportedVideoFormatReason("Source", "av01.0.05m.08")).toBe(
      "AV1 video rendering not yet supported",
    );
    expect(unsupportedVideoFormatReason("Source", "raw")).toBe(
      "Source format 'raw' is unsupported",
    );
    expect(unsupportedSourceFormatReason("Source", " raw ")).toBe(
      "Source format 'raw' is unsupported",
    );
    expect(unsupportedSourceFormatReason("Source", "   ")).toBe(
      "Source format is missing",
    );
  });
});
