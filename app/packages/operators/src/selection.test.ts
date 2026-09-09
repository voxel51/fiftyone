import { describe, expect, it } from "vitest";
import { formatSelectionPayload } from "./operators";

const SELECTION = new Map([
  ["6a752be6d403150a4502a370", "default"],
  ["6a752be6d403150a4502a371", "alt"],
]);

describe("formatSelectionPayload", () => {
  it("sends bare sample ids, with types only in selected_samples", () => {
    const payload = formatSelectionPayload({ selectedSamples: SELECTION });

    expect(payload.selected).toStrictEqual([
      "6a752be6d403150a4502a370",
      "6a752be6d403150a4502a371",
    ]);
    expect(payload.selected_samples).toStrictEqual([
      { id: "6a752be6d403150a4502a370", type: "default" },
      { id: "6a752be6d403150a4502a371", type: "alt" },
    ]);
  });

  it("sends an empty selection when there is none", () => {
    expect(formatSelectionPayload({}).selected).toStrictEqual([]);
  });
});
