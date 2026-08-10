import { describe, expect, it } from "vitest";
import { formatSelectedSampleIds, formatSelectionPayload } from "./operators";

// the selection is a `Map<id, SelectionType>`, so `Array.from` on it yields
// `[id, type]` pairs; the backend passes `selected` straight to `Select`,
// which rejects anything but bare ID strings
const SELECTION = new Map([
  ["6a752be6d403150a4502a370", "default"],
  ["6a752be6d403150a4502a371", "alt"],
]);

describe("formatSelectedSampleIds", () => {
  it("sends bare ids rather than map entries", () => {
    expect(formatSelectedSampleIds(SELECTION)).toStrictEqual([
      "6a752be6d403150a4502a370",
      "6a752be6d403150a4502a371",
    ]);
  });

  it("sends nothing when there is no selection", () => {
    expect(formatSelectedSampleIds(undefined)).toStrictEqual([]);
    expect(formatSelectedSampleIds(new Map())).toStrictEqual([]);
  });
});

describe("formatSelectionPayload", () => {
  it("keeps the selection types out of the id list", () => {
    const payload = formatSelectionPayload({ selectedSamples: SELECTION });

    expect(payload.selected).toStrictEqual([
      "6a752be6d403150a4502a370",
      "6a752be6d403150a4502a371",
    ]);
    expect(payload.selected.every((id) => typeof id === "string")).toBe(true);
    expect(payload.selected_samples).toStrictEqual([
      { id: "6a752be6d403150a4502a370", type: "default" },
      { id: "6a752be6d403150a4502a371", type: "alt" },
    ]);
  });

  it("tolerates a partial context", () => {
    expect(formatSelectionPayload({}).selected).toStrictEqual([]);
  });
});
