import { afterEach, describe, expect, it, vi } from "vitest";

import {
  annexBDecoderCodecString,
  isVideoCodecFamilySupported,
  isVideoCodecSupported,
  resetVideoCodecSupport,
  videoCodecFamily,
  warmVideoCodecSupport,
  type VideoCodecSupportEnvironment,
} from "./video-codec-support";

afterEach(() => {
  resetVideoCodecSupport();
});

function client(
  supported: (codec: string) => boolean | Promise<never>,
): VideoCodecSupportEnvironment {
  return {
    VideoDecoder: {
      isConfigSupported: vi.fn(async ({ codec }) => {
        const answer = supported(codec);
        return { supported: await answer };
      }),
    },
  };
}

describe("video codec support", () => {
  it("reports the family the client accepts, not a fixed allowlist", async () => {
    // The client this test describes is the reported one: HEVC decodes, and
    // MPEG-4 Part 2 does not, which a hardcoded list gets backwards.
    await warmVideoCodecSupport(client((codec) => !codec.startsWith("vp09")));

    expect(isVideoCodecFamilySupported("h265")).toBe(true);
    expect(isVideoCodecFamilySupported("h264")).toBe(true);
    expect(isVideoCodecFamilySupported("vp9")).toBe(false);
    expect(isVideoCodecFamilySupported("unknown")).toBe(false);
  });

  it("refuses a family the client declines even though the pipeline has a path for it", async () => {
    await warmVideoCodecSupport(client((codec) => !codec.startsWith("hev1")));

    expect(isVideoCodecFamilySupported("h265")).toBe(false);
    expect(isVideoCodecFamilySupported("av1")).toBe(true);
  });

  it("answers per codec string, so one refused profile does not condemn the family", async () => {
    const environment = client((codec) => codec === "hev1.1.6.L93.B0");

    await expect(
      isVideoCodecSupported("hev1.1.6.L93.B0", environment),
    ).resolves.toBe(true);
    await expect(
      isVideoCodecSupported("hev1.2.4.L120.b0", environment),
    ).resolves.toBe(false);
  });

  it("treats a codec string the client cannot parse as undecodable", async () => {
    const environment = client(() => Promise.reject(new TypeError("bad")));

    await expect(isVideoCodecSupported("mp4v.20.9", environment)).resolves.toBe(
      false,
    );
  });

  it("probes each codec string once", async () => {
    const environment = client(() => true);

    await isVideoCodecSupported("avc1.640028", environment);
    await isVideoCodecSupported("avc1.640028", environment);

    expect(environment.VideoDecoder?.isConfigSupported).toHaveBeenCalledTimes(
      1,
    );
  });

  it("assumes only the long-standing families where no client can be asked", async () => {
    await expect(isVideoCodecSupported("avc1.640028", {})).resolves.toBe(true);
    await expect(isVideoCodecSupported("av01.0.04M.08", {})).resolves.toBe(
      true,
    );
    await expect(isVideoCodecSupported("hev1.1.6.L93.B0", {})).resolves.toBe(
      false,
    );
    await expect(isVideoCodecSupported("mp4v.20.9", {})).resolves.toBe(false);
  });

  it("classifies container codec strings into decoder families", () => {
    expect(videoCodecFamily("hvc1.1.6.L93.B0")).toBe("h265");
    expect(videoCodecFamily("hev1.1.6.L93.B0")).toBe("h265");
    expect(videoCodecFamily("avc1.640028")).toBe("h264");
    expect(videoCodecFamily("av01.0.04M.08")).toBe("av1");
    expect(videoCodecFamily("vp09.00.10.08")).toBe("vp9");
    expect(videoCodecFamily("mp4v.20.9")).toBe("unknown");
  });

  it("configures HEVC with the fourcc that matches in-band parameter sets", () => {
    expect(annexBDecoderCodecString("hvc1.1.6.L93.B0")).toBe("hev1.1.6.L93.B0");
    expect(annexBDecoderCodecString("hev1.1.6.L93.B0")).toBe("hev1.1.6.L93.B0");
    expect(annexBDecoderCodecString("avc1.640028")).toBe("avc1.640028");
  });
});
