import { describe, expect, it } from "vitest";

import { annexBFromNalUnits, concatAnnexB } from "./annexb";

describe("annexBFromNalUnits", () => {
  it("frames each NAL unit with a start code", () => {
    expect(
      annexBFromNalUnits([Uint8Array.of(0x40, 0x01), Uint8Array.of(0x42)]),
    ).toEqual(Uint8Array.of(0, 0, 0, 1, 0x40, 0x01, 0, 0, 0, 1, 0x42));
  });

  it("reports nothing to inline when a track carries no parameter sets", () => {
    expect(annexBFromNalUnits([])).toBeUndefined();
    expect(annexBFromNalUnits([new Uint8Array(0)])).toBeUndefined();
  });
});

describe("concatAnnexB", () => {
  it("joins already-framed blobs and drops absent ones", () => {
    const parameterSets = Uint8Array.of(0, 0, 0, 1, 0x40);
    const accessUnit = Uint8Array.of(0, 0, 0, 1, 0x26);

    expect(concatAnnexB([parameterSets, accessUnit])).toEqual(
      Uint8Array.of(0, 0, 0, 1, 0x40, 0, 0, 0, 1, 0x26),
    );
    expect(concatAnnexB([undefined, accessUnit])).toBe(accessUnit);
    expect(concatAnnexB([])).toEqual(new Uint8Array(0));
  });
});
