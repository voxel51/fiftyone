import { afterEach, describe, expect, it } from "vitest";
import { MAX_MARKS, span } from "./marks";

afterEach(() => {
  performance.clearMarks();
  performance.clearMeasures();
});

const ours = (type: "mark" | "measure") =>
  performance
    .getEntriesByType(type)
    .filter((entry) => entry.name.startsWith("floodlight:"));

describe("span", () => {
  it("measures each phase from its start, in development", () => {
    const measure = span("page:0");
    measure("response");
    measure("normalized");
    expect(ours("measure").map((entry) => entry.name)).toEqual([
      "floodlight:page:0:response",
      "floodlight:page:0:normalized",
    ]);
  });

  it(`keeps fewer than ${MAX_MARKS} entries, and only clears its own`, () => {
    performance.mark("other");
    for (let i = 0; i < 3 * MAX_MARKS; i++) span(`page:${i}`)("response");
    expect(ours("mark").length + ours("measure").length).toBeLessThan(
      2 * MAX_MARKS,
    );
    expect(performance.getEntriesByName("other")).toHaveLength(1);
  });
});
