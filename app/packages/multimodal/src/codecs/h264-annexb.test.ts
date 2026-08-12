import { describe, expect, it } from "vitest";

import {
  analyzeH264AnnexBAccessUnit,
  h264AccessUnitWithParameterSets,
} from "./h264-annexb";

describe("H.264 Annex-B access unit inspection", () => {
  it("extracts keyframe, codec string, and parameter sets", () => {
    const info = analyzeH264AnnexBAccessUnit(
      Uint8Array.of(
        0,
        0,
        0,
        1,
        0x67,
        0x4d,
        0x00,
        0x1f,
        0,
        0,
        1,
        0x68,
        0xce,
        0x06,
        0,
        0,
        1,
        0x65,
        0xb0,
      ),
    );

    expect(info).toMatchObject({
      codecString: "avc1.4d001f",
      hasBFrames: false,
      hasFrame: true,
      hasStartCodes: true,
      keyframe: true,
      nalUnitTypes: [7, 8, 5],
    });
    expect(Array.from(info.sps ?? [])).toEqual([0x67, 0x4d, 0x00, 0x1f]);
    expect(Array.from(info.pps ?? [])).toEqual([0x68, 0xce, 0x06]);
  });

  it("detects B-slices without treating parse failures as fatal", () => {
    const bFrame = analyzeH264AnnexBAccessUnit(
      Uint8Array.of(0, 0, 1, 0x41, 0xa0),
    );
    const bFrameWithEmulationPrevention = analyzeH264AnnexBAccessUnit(
      Uint8Array.of(0, 0, 1, 0x41, 0xa0, 0, 0, 0x03, 1),
    );
    const pFrame = analyzeH264AnnexBAccessUnit(
      Uint8Array.of(0, 0, 1, 0x41, 0xc0),
    );
    const pFrameWithEmulationPrevention = analyzeH264AnnexBAccessUnit(
      Uint8Array.of(0, 0, 1, 0x41, 0xc0, 0, 0, 0x03, 1),
    );

    expect(bFrame.hasBFrames).toBe(true);
    expect(bFrame.hasFrame).toBe(true);
    expect(bFrameWithEmulationPrevention.hasBFrames).toBe(true);
    expect(bFrameWithEmulationPrevention.hasFrame).toBe(true);
    expect(pFrame.hasBFrames).toBe(false);
    expect(pFrameWithEmulationPrevention.hasBFrames).toBe(false);
    expect(pFrameWithEmulationPrevention.hasFrame).toBe(true);
  });

  it("reports non-Annex-B bytes without throwing", () => {
    const info = analyzeH264AnnexBAccessUnit(Uint8Array.of(0x65, 0xb0));

    expect(info.hasStartCodes).toBe(false);
    expect(info.keyframe).toBe(true);
  });

  it("prepends cached parameter sets to a later access unit", () => {
    expect(
      Array.from(
        h264AccessUnitWithParameterSets({
          bytes: Uint8Array.of(0, 0, 1, 0x65, 0xb0),
          pps: Uint8Array.of(0x68, 0xce),
          sps: Uint8Array.of(0x67, 0x4d, 0x00, 0x1f),
        }),
      ),
    ).toEqual([
      0, 0, 0, 1, 0x67, 0x4d, 0x00, 0x1f, 0, 0, 0, 1, 0x68, 0xce, 0, 0, 1, 0x65,
      0xb0,
    ]);
  });
});
