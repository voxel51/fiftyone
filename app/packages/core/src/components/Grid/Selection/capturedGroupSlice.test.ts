import type { EpisodeSelection } from "@fiftyone/state/src/selection";
import { describe, expect, it } from "vitest";
import { capturedGroupSlice } from "./capturedGroupSlice";

const capture = (id: string, slice: string): EpisodeSelection => ({
  episodeId: id,
  members: [{ episodeId: id, kind: "episode" }],
  node: { id, sample: { _id: id, cameras: { name: slice } } },
});

describe("a captured selection's opening slice", () => {
  it("opens on the captured slice after browsing a different one", () => {
    expect(
      capturedGroupSlice([capture("sample", "left")], "cameras", "right"),
    ).toBe("left");
  });

  it("keeps the current slice when it contains a captured sample", () => {
    expect(
      capturedGroupSlice(
        [capture("left", "left"), capture("right", "right")],
        "cameras",
        "right",
      ),
    ).toBe("right");
  });

  it("uses persisted slice metadata before previews reload, including folded cards", () => {
    const left = {
      ...capture("left", "left"),
      node: undefined,
      groupSlice: "left",
    };
    expect(capturedGroupSlice([left], "cameras", "right")).toBe("left");
    expect(
      capturedGroupSlice(
        [
          capture("visible", "left"),
          { ...left, episodeId: "folded", groupSlice: "right" },
        ],
        "cameras",
        "right",
      ),
    ).toBe("right");
  });

  it("ignores unavailable captures when choosing a populated slice", () => {
    expect(
      capturedGroupSlice(
        [
          { ...capture("deleted", "right"), unavailable: true },
          capture("live", "left"),
        ],
        "cameras",
        "right",
      ),
    ).toBe("left");
  });

  it("keeps the browsing slice for result scopes and captures without metadata", () => {
    expect(capturedGroupSlice([], "cameras", "right")).toBe("right");
    expect(
      capturedGroupSlice(
        [{ episodeId: "sample", members: [], node: undefined }],
        "cameras",
        "right",
      ),
    ).toBe("right");
    expect(capturedGroupSlice([], null, undefined)).toBeUndefined();
  });
});
