import { describe, expect, it } from "vitest";

import { fnv1aBytesHex, fnv1aString } from "./fnv1a";

describe("FNV-1a helpers", () => {
  it("hashes bytes with the canonical offset basis", () => {
    expect(fnv1aBytesHex(new TextEncoder().encode("hello"))).toBe("4f9f2cab");
  });

  it("hashes UTF-16 code units and preserves caller-supplied seeds", () => {
    expect(fnv1aString("hello")).toBe(0x4f9f2cab);
    expect(fnv1aString("hello", 123)).toBe(0x83538209);
  });
});
