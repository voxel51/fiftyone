import { describe, expect, it } from "vitest";
import { PANEL_ID_MAIN, PANEL_ID_SIDE_TOP } from "../constants";
import { isHoverEligibleForPointCloudCrop } from "./point-cloud-crop-eligibility";

describe("isHoverEligibleForPointCloudCrop", () => {
  it("allows sidebar and legacy hovers", () => {
    expect(
      isHoverEligibleForPointCloudCrop(
        { id: "label-1", source: "sidebar" },
        true
      )
    ).toBe(true);
    expect(isHoverEligibleForPointCloudCrop({ id: "label-1" }, true)).toBe(
      true
    );
  });

  it("allows main-panel hovers only when the main pointer is not down", () => {
    expect(
      isHoverEligibleForPointCloudCrop(
        { id: "label-1", source: PANEL_ID_MAIN },
        false
      )
    ).toBe(true);
    expect(
      isHoverEligibleForPointCloudCrop(
        { id: "label-1", source: PANEL_ID_MAIN },
        true
      )
    ).toBe(false);
  });

  it("ignores side-panel hovers", () => {
    expect(
      isHoverEligibleForPointCloudCrop(
        { id: "label-1", source: PANEL_ID_SIDE_TOP },
        false
      )
    ).toBe(false);
  });
});
