import { describe, expect, it } from "vitest";

import {
  MalformedEntityIdError,
  decodeEntityId,
  encodeEntityId,
} from "./entityId";
import {
  addressIdOf,
  indexFromAddressId,
  refKey,
  refsEqual,
  toLabelRef,
} from "./ref";
import type { LabelRef } from "./ref";

const ref = (overrides: Partial<LabelRef> = {}): LabelRef => ({
  sample: "sample-1",
  path: "ground_truth",
  instanceId: "abc123",
  ...overrides,
});

describe("refsEqual", () => {
  it("matches on the full identity tuple", () => {
    expect(refsEqual(ref(), ref())).toBe(true);
    expect(refsEqual(ref({ frame: 3 }), ref({ frame: 3 }))).toBe(true);
  });

  it("distinguishes refs differing in any tuple member", () => {
    expect(refsEqual(ref(), ref({ sample: "sample-2" }))).toBe(false);
    expect(refsEqual(ref(), ref({ path: "predictions" }))).toBe(false);
    expect(refsEqual(ref(), ref({ instanceId: "def456" }))).toBe(false);
    expect(refsEqual(ref(), ref({ frame: 1 }))).toBe(false);
  });

  it("treats sample-level (frame undefined) as distinct from frame 0", () => {
    expect(refsEqual(ref(), ref({ frame: 0 }))).toBe(false);
  });

  it("shared instanceId across samples is NOT identity", () => {
    const sliceA = ref({ sample: "slice-a" });
    const sliceB = ref({ sample: "slice-b" });

    expect(sliceA.instanceId).toBe(sliceB.instanceId);
    expect(refsEqual(sliceA, sliceB)).toBe(false);
    expect(refKey(sliceA)).not.toBe(refKey(sliceB));
  });
});

describe("refKey", () => {
  it("is deterministic and frame-sensitive", () => {
    expect(refKey(ref())).toBe(refKey(ref()));
    expect(refKey(ref({ frame: 2 }))).not.toBe(refKey(ref()));
    expect(refKey(ref({ frame: 0 }))).not.toBe(refKey(ref()));
  });
});

describe("toLabelRef", () => {
  it("binds a scoped ref to its sample", () => {
    const bound = toLabelRef("sample-9", {
      path: "ground_truth",
      instanceId: "abc123",
      frame: 4,
    });

    expect(bound).toEqual(ref({ sample: "sample-9", frame: 4 }));
  });
});

describe("addressIdOf", () => {
  it("prefers the instance _id when present", () => {
    expect(
      addressIdOf({ _id: "doc-1", index: 3, instance: { _id: "inst-1" } }),
    ).toBe("inst-1");
  });

  it("falls back to a synthetic track-<index> for an instance-less label", () => {
    expect(addressIdOf({ _id: "doc-1", index: 3 })).toBe("track-3");
    // index 0 is a real track, not "absent"
    expect(addressIdOf({ _id: "doc-1", index: 0 })).toBe("track-0");
  });

  it("falls back to the doc _id for a bare label (no instance, no index)", () => {
    expect(addressIdOf({ _id: "doc-1" })).toBe("doc-1");
  });
});

describe("indexFromAddressId", () => {
  it("decodes the index from a track-<index> id", () => {
    expect(indexFromAddressId("track-3")).toBe(3);
    expect(indexFromAddressId("track-0")).toBe(0);
  });

  it("returns undefined for a non-index address id", () => {
    expect(indexFromAddressId("inst-1")).toBeUndefined();
    expect(indexFromAddressId("track-nope")).toBeUndefined();
  });
});

describe("EntityId encode/decode", () => {
  it("round-trips a sample-level identity", () => {
    const id = encodeEntityId("quickstart", ref());

    expect(id).toBe("v1:quickstart:sample-1:ground_truth:abc123");
    expect(decodeEntityId(id)).toEqual({
      dataset: "quickstart",
      ref: ref(),
    });
  });

  it("round-trips a frame-level identity", () => {
    const id = encodeEntityId("quickstart-video", ref({ frame: 12 }));

    expect(decodeEntityId(id)).toEqual({
      dataset: "quickstart-video",
      ref: ref({ frame: 12 }),
    });
  });

  it("round-trips frame 0 without collapsing it to sample-level", () => {
    const id = encodeEntityId("d", ref({ frame: 0 }));

    expect(decodeEntityId(id).ref.frame).toBe(0);
  });

  it("escapes delimiter and escape characters in segments", () => {
    const tricky = ref({
      sample: "sa:mple",
      path: "weird\\path:with:colons",
    });
    const id = encodeEntityId("data:set\\1", tricky);

    expect(decodeEntityId(id)).toEqual({
      dataset: "data:set\\1",
      ref: tricky,
    });
  });

  it("throws on an unknown version", () => {
    expect(() => decodeEntityId("v2:d:s:p:i")).toThrow(MalformedEntityIdError);
  });

  it("throws on missing segments", () => {
    expect(() => decodeEntityId("v1:d:s:p")).toThrow(MalformedEntityIdError);
  });

  it("throws on extra segments", () => {
    expect(() => decodeEntityId("v1:d:s:p:i:1:extra")).toThrow(
      MalformedEntityIdError,
    );
  });

  it("throws on an empty identity segment", () => {
    expect(() => decodeEntityId("v1:d::p:i")).toThrow(MalformedEntityIdError);
  });

  it("throws on a non-integer frame", () => {
    expect(() => decodeEntityId("v1:d:s:p:i:1.5")).toThrow(
      MalformedEntityIdError,
    );
    expect(() => decodeEntityId("v1:d:s:p:i:abc")).toThrow(
      MalformedEntityIdError,
    );
  });
});
