import { describe, expect, it } from "vitest";
import { toggleShownLabelAttribute } from "./labelAttributes";

describe("toggleShownLabelAttribute", () => {
  it("adds an attribute that is not shown", () => {
    expect(toggleShownLabelAttribute(["label"], "confidence")).toEqual([
      "label",
      "confidence",
    ]);
  });

  it("removes a shown attribute", () => {
    expect(toggleShownLabelAttribute(["label", "confidence"], "label")).toEqual(
      ["confidence"],
    );
  });

  it("keeps the last shown attribute", () => {
    expect(toggleShownLabelAttribute(["label"], "label")).toEqual(["label"]);
  });
});
