/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { codecFamily, isKeyframeSample, keyframeProbe } from "./sampleKeyframe";

/** One length-prefixed NAL unit: `[length][header][payload…]`. */
const nal = (header: number, lengthSize = 4, payload = 2): number[] => {
  const length = payload + 1;
  const prefix = Array.from(
    { length: lengthSize },
    (_, i) => (length >> (8 * (lengthSize - 1 - i))) & 0xff,
  );
  return [...prefix, header, ...new Array<number>(payload).fill(0)];
};

const bytes = (...parts: number[][]) => Uint8Array.from(parts.flat());

/** avcC / hvcC payloads whose lengthSizeMinusOne field reads 3 (4-byte prefixes). */
const AVCC = Uint8Array.from([1, 0x64, 0x00, 0x28, 0xff]);
const HVCC = Uint8Array.from(
  new Array<number>(23).fill(0).map((_, i) => (i === 21 ? 0xff : 0)),
);

const AVC = keyframeProbe("avc1.640028", AVCC);
const HEVC = keyframeProbe("hvc1.1.6.L93.B0", HVCC);
const VP9 = keyframeProbe("vp09.00.10.08");

// H.264 NAL headers: nal_ref_idc in bits 5-6, nal_unit_type in the low five.
const AUD = 0x09;
const SEI = 0x06;
const SPS = 0x67;
const PPS = 0x68;
const IDR = 0x65;
const NON_IDR = 0x41;

describe("codecFamily", () => {
  it("maps fourccs to families", () => {
    expect(codecFamily("avc1.640028")).toBe("avc");
    expect(codecFamily("avc3.42E01E")).toBe("avc");
    expect(codecFamily("hvc1.1.6.L93.B0")).toBe("hevc");
    expect(codecFamily("hev1.1.6.L93.B0")).toBe("hevc");
    expect(codecFamily("vp09.00.10.08")).toBe("vp9");
    expect(codecFamily("av01.0.04M.08")).toBe("other");
  });
});

describe("keyframeProbe", () => {
  it("reads the NAL length size from the description", () => {
    expect(
      keyframeProbe("avc1.640028", Uint8Array.from([1, 0, 0, 0, 0xfd])),
    ).toEqual({
      family: "avc",
      nalLengthSize: 2,
    });
    expect(HEVC.nalLengthSize).toBe(4);
  });

  it("defaults to 4-byte prefixes without a description", () => {
    expect(keyframeProbe("avc1.640028")).toEqual({
      family: "avc",
      nalLengthSize: 4,
    });
  });
});

describe("isKeyframeSample: H.264", () => {
  it("is a keyframe when an IDR slice is present, wherever it sits", () => {
    expect(isKeyframeSample(bytes(nal(IDR)), AVC)).toBe(true);
    expect(
      isKeyframeSample(bytes(nal(SEI), nal(SPS), nal(PPS), nal(IDR)), AVC),
    ).toBe(true);
  });

  it("is not a keyframe for a non-IDR slice", () => {
    expect(isKeyframeSample(bytes(nal(NON_IDR)), AVC)).toBe(false);
  });

  it("rejects a bare I-frame flagged sync: access-unit delimiter then a non-IDR slice", () => {
    // Constrained Baseline camera encodes list every Nth frame as sync but
    // only emit a true IDR (with SPS/PPS) every few GOPs.
    expect(isKeyframeSample(bytes(nal(AUD), nal(NON_IDR)), AVC)).toBe(false);
    expect(
      isKeyframeSample(bytes(nal(AUD), nal(SPS), nal(PPS), nal(IDR)), AVC),
    ).toBe(true);
  });

  it("rejects an open-GOP I-frame: recovery-point SEI then a non-IDR slice", () => {
    // Leading bytes of the sample x264 (open-gop=1) emits at a GOP boundary and
    // the mp4 muxer lists as a sync sample; the slice header is truncated.
    const sample = Uint8Array.from(
      Buffer.from(
        "00000005060601c480" +
          "000000274188ed004ffffeeae3fccb2b623cd7fc55e8f15b5b95d4d3d21244",
        "hex",
      ),
    );
    expect(isKeyframeSample(sample, AVC)).toBe(false);
  });

  it("honors a 2-byte length prefix", () => {
    const probe = keyframeProbe(
      "avc1.640028",
      Uint8Array.from([1, 0, 0, 0, 0xfd]),
    );
    expect(isKeyframeSample(bytes(nal(SEI, 2), nal(IDR, 2)), probe)).toBe(true);
    expect(isKeyframeSample(bytes(nal(SEI, 2), nal(NON_IDR, 2)), probe)).toBe(
      false,
    );
  });

  it("stops on a zero-length NAL instead of spinning", () => {
    expect(
      isKeyframeSample(Uint8Array.from([0, 0, 0, 0, NON_IDR, 0, 0]), AVC),
    ).toBe(false);
  });

  it("treats an empty sample as not a keyframe", () => {
    expect(isKeyframeSample(new Uint8Array(0), AVC)).toBe(false);
  });
});

describe("isKeyframeSample: HEVC", () => {
  // nal_unit_type occupies bits 1-6 of the first header byte.
  const header = (type: number) => type << 1;

  it("accepts IRAP pictures", () => {
    expect(isKeyframeSample(bytes(nal(header(19))), HEVC)).toBe(true); // IDR_W_RADL
    expect(isKeyframeSample(bytes(nal(header(20))), HEVC)).toBe(true); // IDR_N_LP
    expect(isKeyframeSample(bytes(nal(header(21))), HEVC)).toBe(true); // CRA
    expect(isKeyframeSample(bytes(nal(header(16))), HEVC)).toBe(true); // BLA_W_LP
  });

  it("rejects trailing pictures", () => {
    expect(isKeyframeSample(bytes(nal(header(1))), HEVC)).toBe(false); // TRAIL_R
    expect(isKeyframeSample(bytes(nal(header(39)), nal(header(0))), HEVC)).toBe(
      false,
    );
  });
});

describe("isKeyframeSample: VP9", () => {
  it("reads frame_type from the uncompressed header", () => {
    // First bytes of libvpx profile-0 samples: key, then inter.
    expect(isKeyframeSample(Uint8Array.from([0x82, 0x49, 0x83]), VP9)).toBe(
      true,
    );
    expect(isKeyframeSample(Uint8Array.from([0x86, 0x00, 0x40]), VP9)).toBe(
      false,
    );
  });

  it("rejects show_existing_frame headers", () => {
    expect(isKeyframeSample(Uint8Array.from([0x88]), VP9)).toBe(false);
  });

  it("skips the reserved bit for profile 3", () => {
    expect(isKeyframeSample(Uint8Array.from([0xb0]), VP9)).toBe(true);
    expect(isKeyframeSample(Uint8Array.from([0xb2]), VP9)).toBe(false);
  });

  it("rejects a bad frame marker and an empty sample", () => {
    expect(isKeyframeSample(Uint8Array.from([0x02]), VP9)).toBe(false);
    expect(isKeyframeSample(new Uint8Array(0), VP9)).toBe(false);
  });
});

describe("isKeyframeSample: other codecs", () => {
  it("defers to the container", () => {
    expect(
      isKeyframeSample(
        Uint8Array.from([0x12, 0x00]),
        keyframeProbe("av01.0.04M.08"),
      ),
    ).toBeNull();
  });
});
