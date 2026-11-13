import { describe, expect, it } from "vitest";
import { isMaskDetection } from "./maskDetection";

describe("isMaskDetection", () => {
  it("accepts a masked detection typed by its Detection or Detections field", () => {
    expect(isMaskDetection({ type: "Detection", data: { mask: [[1]] } })).toBe(
      true,
    );
    expect(
      isMaskDetection({ type: "Detections", data: { mask_path: "/m.png" } }),
    ).toBe(true);
  });

  it("rejects detections without a mask and other label types", () => {
    expect(isMaskDetection({ type: "Detections", data: {} })).toBe(false);
    expect(isMaskDetection({ type: "Polyline", data: { mask: [[1]] } })).toBe(
      false,
    );
    expect(isMaskDetection(null)).toBe(false);
  });
});
