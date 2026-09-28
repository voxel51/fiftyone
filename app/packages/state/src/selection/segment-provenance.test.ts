import { describe, expect, it } from "vitest";
import { savedSegmentPinScope, savedSegmentSource } from "./segment-provenance";
import type { SelectionRange } from "./types";

const range: SelectionRange = {
  start: "1",
  end: "10",
  streams: ["camera"],
  timebase: "sequence",
  provenance: [],
};
describe("saved segment source labels", () => {
  it("isolates pins when constraints change the sources in a saved track", () => {
    const boundary = { subsetId: "subset", subsetScope: "segments" as const };
    expect(savedSegmentPinScope(boundary)).toBe("subset");
    const filtered = savedSegmentPinScope({
      ...boundary,
      provider: { kind: "temporal-tags", values: ["braking"] },
    });
    expect(filtered).not.toBe(savedSegmentPinScope(boundary));
    expect(filtered).not.toBe(
      savedSegmentPinScope({
        ...boundary,
        provider: { kind: "temporal-tags", values: ["stopped"] },
      }),
    );
    expect(
      savedSegmentPinScope({ ...boundary, subsetScope: "episodes" }),
    ).toBeUndefined();
  });

  it("uses the captured event name and keeps all origins on one mark", () => {
    const event = {
      provider: "events",
      source: "ground_truth",
      label: "braking",
      itemId: "one",
    };
    const tag = { provider: "temporal-tags", source: "near miss" };
    const first = savedSegmentSource({
      ...range,
      provenance: [event, tag, event],
    });
    expect(first.label).toBe("Event: braking · Temporal tag: near miss");
    expect(
      savedSegmentSource({
        ...range,
        provenance: [tag, { ...event, itemId: "two" }],
      }),
    ).toEqual(first);
  });
  it("falls back for older captures without inventing a source", () => {
    expect(savedSegmentSource(range).label).toBe("Saved segment");
    expect(
      savedSegmentSource({
        ...range,
        provenance: [{ provider: "events", source: "ground_truth" }],
      }).label,
    ).toBe("Event: ground_truth");
  });
});
