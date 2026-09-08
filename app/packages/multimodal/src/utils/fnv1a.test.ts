import { describe, expect, it } from "vitest";

import { fnv1aBytesHex, fnv1aFingerprint, fnv1aString } from "./fnv1a";

describe("FNV-1a helpers", () => {
  it("hashes bytes with the canonical offset basis", () => {
    expect(fnv1aBytesHex(new TextEncoder().encode("hello"))).toBe("4f9f2cab");
  });

  it("hashes UTF-16 code units and preserves caller-supplied seeds", () => {
    expect(fnv1aString("hello")).toBe(0x4f9f2cab);
    expect(fnv1aString("hello", 123)).toBe(0x83538209);
  });

  it("builds namespaced fingerprints with optional salting", () => {
    expect(fnv1aFingerprint("record", "/camera")).toBe(
      "record-e71cb92ddd7b0601",
    );
    expect(fnv1aFingerprint("source", "/camera", 123)).toMatch(
      /^source-[0-9a-f]{16}$/,
    );
    expect(fnv1aFingerprint("source", "/camera", 123)).not.toBe(
      fnv1aFingerprint("source", "/camera"),
    );
  });
});
