import { describe, expect, it } from "vitest";
import { mediaSourcesFingerprint } from "./use-stable-episode-source";

describe("mediaSourcesFingerprint", () => {
  it("changes when a source moves, so the episode source is rebuilt", () => {
    // A key derived from the table's size rather than its contents misses
    // this, leaving a tile pointed at a location the source no longer has.
    expect(mediaSourcesFingerprint({ a: "/a" })).not.toBe(
      mediaSourcesFingerprint({ a: "/moved" }),
    );
  });

  it("holds when the same table arrives in a different order", () => {
    // Otherwise key order alone rebuilds the episode source, tearing down a
    // session that is still reading from it.
    expect(mediaSourcesFingerprint({ a: "/a", b: "/b" })).toBe(
      mediaSourcesFingerprint({ b: "/b", a: "/a" }),
    );
  });
});
