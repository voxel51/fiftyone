import { describe, expect, it } from "vitest";

import { VISUALIZATION_KIND, type EncodedVideoVisualization } from "../ir";
import {
  isSharedEncodedVideoVisualization,
  sharedVideoRejectionMessage,
  VideoDecoderFailureError,
  VideoDependencyWaitError,
  VideoIntentCancelledError,
  VideoSchedulerClosedError,
} from "./types";

describe("encoded video playback rejection", () => {
  it("names the codec a client cannot decode, and how to make it playable", () => {
    const hevc: EncodedVideoVisualization = {
      bytes: new Uint8Array(0),
      codec: "h265",
      format: "hev1.2.4.L120.b0",
      kind: VISUALIZATION_KIND.ENCODED_VIDEO,
      undecodable: true,
    };

    expect(isSharedEncodedVideoVisualization(hevc)).toBe(false);
    expect(sharedVideoRejectionMessage(hevc)).toBe(
      "HEVC video ('hev1.2.4.L120.b0') cannot be decoded in this browser. " +
        "Transcode this camera to H.264 or AV1 to view it.",
    );
  });

  it("refuses a marked frame whose codec it would otherwise accept", () => {
    // AV1 needs no payload contract, so the undecodable flag is the only
    // thing that can reject this - nothing else in the guard looks at it.
    const av1: EncodedVideoVisualization = {
      bytes: new Uint8Array(0),
      codec: "av1",
      format: "av01.0.04M.08",
      kind: VISUALIZATION_KIND.ENCODED_VIDEO,
      undecodable: true,
    };

    expect(isSharedEncodedVideoVisualization(av1)).toBe(false);
    expect(sharedVideoRejectionMessage(av1)).toContain("av01.0.04M.08");
  });

  it("names a codec it has no label for by its format string", () => {
    const mpeg4: EncodedVideoVisualization = {
      bytes: new Uint8Array(0),
      codec: "unknown",
      format: "mp4v.20.9",
      kind: VISUALIZATION_KIND.ENCODED_VIDEO,
      undecodable: true,
    };

    expect(isSharedEncodedVideoVisualization(mpeg4)).toBe(false);
    expect(sharedVideoRejectionMessage(mpeg4)).toContain("'mp4v.20.9'");
  });

  it("plays HEVC access units that carry the parameter sets a decoder needs", () => {
    const hevc: EncodedVideoVisualization = {
      bytes: Uint8Array.of(0, 0, 0, 1, 0x26, 0x01),
      codec: "h265",
      format: "hvc1.1.6.L93.B0",
      hevc: {
        codecString: "hev1.1.6.L93.B0",
        parameterSets: Uint8Array.of(0, 0, 0, 1, 0x40, 0x01),
      },
      keyframe: true,
      kind: VISUALIZATION_KIND.ENCODED_VIDEO,
    };

    expect(isSharedEncodedVideoVisualization(hevc)).toBe(true);
  });

  it("keeps reporting H.264 metadata-only frames as missing data", () => {
    const h264: EncodedVideoVisualization = {
      bytes: new Uint8Array(0),
      codec: "h264",
      format: "avc1.640028",
      h264: { hasFrame: false },
      kind: VISUALIZATION_KIND.ENCODED_VIDEO,
    };

    expect(isSharedEncodedVideoVisualization(h264)).toBe(false);
    expect(sharedVideoRejectionMessage(h264)).toBe(
      "H.264 video frame data is unavailable",
    );
  });
});

describe("video errors", () => {
  it("constructs typed errors when the host freezes the base Error name", () => {
    const errors = withReadonlyErrorName(() => [
      new VideoIntentCancelledError(),
      new VideoDependencyWaitError("waiting"),
      new VideoDecoderFailureError("failed"),
      new VideoSchedulerClosedError(),
    ]);

    expect(errors.map((error) => error.name)).toEqual([
      "VideoIntentCancelledError",
      "VideoDependencyWaitError",
      "VideoDecoderFailureError",
      "VideoSchedulerClosedError",
    ]);
    for (const error of errors) {
      error.name = "RenamedError";
      expect(error.name).toBe("RenamedError");
    }
  });
});

function withReadonlyErrorName<T>(construct: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(Error.prototype, "name");
  if (!descriptor) throw new Error("Error.prototype.name is unavailable");
  Object.defineProperty(Error.prototype, "name", {
    ...descriptor,
    writable: false,
  });
  try {
    return construct();
  } finally {
    Object.defineProperty(Error.prototype, "name", descriptor);
  }
}
