import { describe, expect, it } from "vitest";
import { DTYPE_F32, HEADER_BYTES, MAGIC, idAt, parseHeader } from "./protocol";

const makeColumn = (
  dtype: number,
  width: number,
  n: number,
  payload: Uint8Array,
  flags = 0,
): ArrayBuffer => {
  const buffer = new ArrayBuffer(HEADER_BYTES + payload.byteLength);
  const view = new DataView(buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint16(4, 1, true);
  view.setUint8(6, dtype);
  view.setUint8(7, width);
  view.setUint32(8, n, true);
  view.setUint32(12, flags, true);
  new Uint8Array(buffer, HEADER_BYTES).set(payload);
  return buffer;
};

describe("parseHeader", () => {
  it("round-trips header fields", () => {
    const buffer = makeColumn(DTYPE_F32, 2, 100, new Uint8Array(800), 3);
    expect(parseHeader(buffer)).toEqual({
      version: 1,
      dtype: DTYPE_F32,
      width: 2,
      n: 100,
      flags: 3,
    });
  });

  // Version exists for exactly this: newer layouts must fail loudly,
  // not decode as garbage
  it("rejects an unsupported version", () => {
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);
    view.setUint32(0, MAGIC, true);
    view.setUint16(4, 2, true);
    expect(() => parseHeader(buffer)).toThrow(/version/i);
  });

  it("rejects a bad magic", () => {
    const buffer = makeColumn(DTYPE_F32, 1, 1, new Uint8Array(4));
    new DataView(buffer).setUint32(0, 0xdeadbeef, true);
    expect(() => parseHeader(buffer)).toThrow(/magic/);
  });

  it("rejects a truncated response", () => {
    expect(() => parseHeader(new ArrayBuffer(4))).toThrow(/short/);
  });
});

describe("unpackBits", () => {
  it("unpacks little bit-order masks to bytes", async () => {
    const { unpackBits } = await import("./protocol");
    // bits 0, 2, 8 set across two bytes
    const packed = new Uint8Array([0b0000_0101, 0b0000_0001]);
    expect(Array.from(unpackBits(packed, 10))).toEqual([
      1, 0, 1, 0, 0, 0, 0, 0, 1, 0,
    ]);
  });
});

describe("buildIdIndex", () => {
  it("maps hex ids to wire indices, honoring the count cap", async () => {
    const { buildIdIndex } = await import("./protocol");
    const bytes = new Uint8Array(36);
    bytes[11] = 1; // id 0 ends ...01
    bytes[23] = 2; // id 1 ends ...02
    // id 2 stays all zeros (an "unloaded" progressive slot)

    const map = buildIdIndex(bytes, 2);
    expect(map.size).toBe(2);
    expect(map.get("000000000000000000000001")).toEqual([0]);
    expect(map.get("000000000000000000000002")).toEqual([1]);
    expect(map.get("000000000000000000000000")).toBeUndefined();
  });

  it("collects every index sharing one id, not just the last", async () => {
    // A multimodal run's points share one sample (episode) id across
    // many windows — the map must keep all of them, in wire order
    const { buildIdIndex } = await import("./protocol");
    const bytes = new Uint8Array(36);
    bytes[11] = 1; // id 0 ends ...01
    bytes[23] = 1; // id 1 also ends ...01 (same episode, another window)
    bytes[35] = 2; // id 2 ends ...02

    const map = buildIdIndex(bytes, 3);
    expect(map.get("000000000000000000000001")).toEqual([0, 1]);
    expect(map.get("000000000000000000000002")).toEqual([2]);
  });
});

describe("idAt", () => {
  it("decodes 12-byte ids to hex on demand", () => {
    const bytes = new Uint8Array([
      // id 0
      0x65, 0x00, 0xff, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09,
      // id 1
      0xab, 0xcd, 0xef, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88,
    ]);
    expect(idAt(bytes, 0)).toBe("6500ff010203040506070809");
    expect(idAt(bytes, 1)).toBe("abcdef001122334455667788");
  });
});
