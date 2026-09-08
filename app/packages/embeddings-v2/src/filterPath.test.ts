import { describe, expect, it } from "vitest";
import { gridFilterPath } from "./filterPath";

describe("gridFilterPath", () => {
  it("drops the list segment for patch paths in a patches view", () => {
    // Filters written under the root path are silently dropped by the
    // server in a patches view (FOEPD-4404) — the patches vocabulary
    // is the one the grid resolves
    expect(
      gridFilterPath("ground_truth.detections.label", "ground_truth", true),
    ).toBe("ground_truth.label");
  });

  it("re-roots nested leaves whole", () => {
    expect(
      gridFilterPath(
        "ground_truth.detections.attributes.occluded",
        "ground_truth",
        true,
      ),
    ).toBe("ground_truth.attributes.occluded");
  });

  it("passes root paths through outside a patches view", () => {
    expect(
      gridFilterPath("ground_truth.detections.label", "ground_truth", false),
    ).toBe("ground_truth.detections.label");
  });

  it("passes through for samples runs (no patches field)", () => {
    expect(gridFilterPath("uniqueness", null, true)).toBe("uniqueness");
  });

  it("passes through paths outside the patches field", () => {
    expect(
      gridFilterPath("predictions.detections.label", "ground_truth", true),
    ).toBe("predictions.detections.label");
  });

  it("leaves the bare list path alone", () => {
    expect(
      gridFilterPath("ground_truth.detections", "ground_truth", true),
    ).toBe("ground_truth.detections");
  });

  it("does not treat a prefix-sharing field as the patches field", () => {
    expect(
      gridFilterPath("ground_truth_2.detections.label", "ground_truth", true),
    ).toBe("ground_truth_2.detections.label");
  });
});
