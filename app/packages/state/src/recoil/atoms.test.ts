import { describe, expect, it } from "vitest";
import { vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");

import { setMockAtoms, TestSelector } from "../../../../__mocks__/recoil";
import * as atoms from "./atoms";

describe("supportsTemporalTags", () => {
  const testSupportsTemporalTags = <
    TestSelector<typeof atoms.supportsTemporalTags>
  >(<unknown>atoms.supportsTemporalTags);

  it("covers the media types that carry a playhead of their own", () => {
    setMockAtoms({ groupMediaTypesSet: new Set<string>() });

    setMockAtoms({ mediaType: "video" });
    expect(testSupportsTemporalTags()).toBe(true);

    setMockAtoms({ mediaType: "multimodal" });
    expect(testSupportsTemporalTags()).toBe(true);
  });

  it("covers a grouped dataset with a video slice, whatever slice is in view", () => {
    // A grouped match is reported on the active slice even when the interval
    // lives on a sibling, so the filter stays offered on every slice.
    setMockAtoms({
      mediaType: "group",
      groupMediaTypesSet: new Set(["image", "video"]),
    });

    expect(testSupportsTemporalTags()).toBe(true);
  });

  it("leaves out datasets with nothing to place an interval on", () => {
    setMockAtoms({ mediaType: "image", groupMediaTypesSet: new Set<string>() });
    expect(testSupportsTemporalTags()).toBe(false);

    setMockAtoms({
      mediaType: "group",
      groupMediaTypesSet: new Set(["image", "point_cloud"]),
    });
    expect(testSupportsTemporalTags()).toBe(false);
  });
});
