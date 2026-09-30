import { describe, expect, it } from "vitest";
import { vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");

import { setMockAtoms, TestSelectorFamily } from "../../../../__mocks__/recoil";
import * as atoms from "./atoms";

describe("supportsTemporalTags", () => {
  const testSupportsTemporalTags = (modal: boolean) =>
    (<TestSelectorFamily<typeof atoms.supportsTemporalTags>>(
      (<unknown>atoms.supportsTemporalTags(modal))
    ))();

  it("covers the media types that carry a playhead of their own", () => {
    setMockAtoms({ mediaType: "video" });
    expect(testSupportsTemporalTags(false)).toBe(true);

    setMockAtoms({ mediaType: "multimodal" });
    expect(testSupportsTemporalTags(false)).toBe(true);
  });

  it("covers a grouped dataset only on a video slice, grid and modal each by their own slice", () => {
    setMockAtoms({
      mediaType: "group",
      groupMediaTypesMap: { left: "image", video: "video" },
      currentSlice: (modal: boolean) => (modal ? "video" : "left"),
    });

    expect(testSupportsTemporalTags(false)).toBe(false);
    expect(testSupportsTemporalTags(true)).toBe(true);
  });

  it("leaves out datasets with nothing to place an interval on", () => {
    setMockAtoms({ mediaType: "image" });
    expect(testSupportsTemporalTags(false)).toBe(false);
  });
});
