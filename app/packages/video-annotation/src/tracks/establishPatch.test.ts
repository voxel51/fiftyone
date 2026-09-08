import { describe, expect, it } from "vitest";
import { establishPatchFor } from "./establishPatch";

describe("establishPatchFor", () => {
  it("stamps keyframe and instance on a bare drawn label", () => {
    expect(establishPatchFor({}, "abc123")).toEqual({
      keyframe: true,
      instance: { _id: "abc123", _cls: "Instance" },
    });
  });

  it("leaves an already-keyframed label's flag alone", () => {
    expect(establishPatchFor({ keyframe: true }, "abc123")).toEqual({
      instance: { _id: "abc123", _cls: "Instance" },
    });
  });

  it("keeps an existing instance", () => {
    expect(
      establishPatchFor(
        { keyframe: true, instance: { _id: "existing" } },
        "abc123",
      ),
    ).toEqual({});
  });

  it("never mints a synthetic instance for an index-addressed track", () => {
    expect(establishPatchFor({ keyframe: true }, "track-3")).toEqual({});
  });
});
