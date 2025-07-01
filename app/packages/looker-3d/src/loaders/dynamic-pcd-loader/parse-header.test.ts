import { describe, expect, it } from "vitest";
import { parseHeader } from "./parse-header";

const makeBuffer = (str: string): ArrayBuffer => {
  return new TextEncoder().encode(str).buffer as ArrayBuffer;
};

describe("parseHeader()", () => {
  it("parses a minimal ASCII header with explicit COUNT & POINTS", () => {
    const hdr = `
# comment line
FIELDS x y z rgb
SIZE 4 4 4 4
TYPE F F F F
COUNT 1 1 1 1
WIDTH 2
HEIGHT 3
POINTS 6
DATA ascii
`.trimStart();
    const h = parseHeader(makeBuffer(hdr));

    expect(h.data).toBe("ascii");
    expect(h.fields).toEqual(["x", "y", "z", "rgb"]);
    expect(h.size).toEqual([4, 4, 4, 4]);
    expect(h.type).toEqual(["F", "F", "F", "F"]);
    expect(h.count).toEqual([1, 1, 1, 1]);
    expect(h.width).toBe(2);
    expect(h.height).toBe(3);
    expect(h.points).toBe(6);
    // ascii: offset is index of field
    expect(h.offset).toEqual({ x: 0, y: 1, z: 2, rgb: 3 });
    // rowSize = sum(size[i]*count[i])
    expect(h.rowSize).toBe(16);
    // str should not contain comment markers
    expect(h.str).not.toContain("#");
  });

  it("defaults COUNT to ones when missing", () => {
    const hdr = `
FIELDS a b
SIZE 2 4
TYPE F I
WIDTH 5
HEIGHT 7
DATA ascii
`.trimStart();
    const h = parseHeader(makeBuffer(hdr));
    expect(h.fields).toEqual(["a", "b"]);
    expect(h.count).toEqual([1, 1]);
    expect(h.size).toEqual([2, 4]);
    expect(h.type).toEqual(["F", "I"]);
    expect(h.points).toBe(5 * 7);
    expect(h.rowSize).toBe(2 * 1 + 4 * 1);
  });

  it("computes offsets & rowSize correctly for binary DATA", () => {
    const hdr = `
FIELDS x y z
SIZE 4 4 2
TYPE F F U
COUNT 1 1 2
WIDTH 1
HEIGHT 1
DATA binary
`.trimStart();
    const h = parseHeader(makeBuffer(hdr));

    expect(h.data).toBe("binary");
    // offset for non-ascii: first=0, second=4*1=4, third=4+4=8
    expect(h.offset).toEqual({ x: 0, y: 4, z: 8 });
    // rowSize = 4*1 +4*1 +2*2 = 4+4+4 = 12
    expect(h.rowSize).toBe(12);
  });

  it("accepts TYPE codes F, I, U only", () => {
    const hdr = `
FIELDS a
SIZE 1
TYPE X
DATA ascii
`.trimStart();
    expect(() => parseHeader(makeBuffer(hdr))).toThrow(
      "Unsupported PCD TYPE code: X"
    );
  });

  it("parses a header with no POINTS line (uses width*height)", () => {
    const hdr = `
FIELDS x y
SIZE 4 4
TYPE F F
COUNT 1 1
WIDTH 3
HEIGHT 4
DATA ascii
`.trimStart();
    const h = parseHeader(makeBuffer(hdr));
    expect(h.points).toBe(3 * 4);
  });

  it("strips comments that appear after valid lines", () => {
    const hdr = `
FIELDS x y    # coords
SIZE 4 4  # bytes
TYPE F F
DATA ascii
`.trimStart();
    const h = parseHeader(makeBuffer(hdr));
    // no '#' in the stored header string
    expect(h.str).not.toContain("#");
    // fields still parsed correctly
    expect(h.fields).toEqual(["x", "y"]);
  });

  it("computes headerLen at the end of the DATA line", () => {
    const hdr = `FIELDS x
SIZE 1
TYPE F
DATA binary_compressed
EXTRA BINARY-BLOB`;
    const buf = makeBuffer(hdr);
    const h = parseHeader(buf);
    // slice and trim trailing newline if any
    const full = new TextDecoder().decode(buf);
    const sliced = full.slice(0, h.headerLen).trimEnd();
    expect(sliced).toMatch(/DATA\s+binary_compressed$/);
  });
});
