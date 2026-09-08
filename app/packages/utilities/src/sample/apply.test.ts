import { describe, expect, it } from "vitest";

import { applyDeltas } from "./apply";

describe("applyDeltas", () => {
  it("appends via the `/-` token", () => {
    const doc = { list: [{ _id: "a" }] };
    const next = applyDeltas(doc, [
      { op: "add", path: "/list/-", value: { _id: "b" } },
    ]);

    expect(next.list).toEqual([{ _id: "a" }, { _id: "b" }]);
  });

  it("applies replace and remove at indices", () => {
    const doc = { list: [{ v: 1 }, { v: 2 }, { v: 3 }] };
    const next = applyDeltas(doc, [
      { op: "replace", path: "/list/0/v", value: 9 },
      { op: "remove", path: "/list/2" },
    ]);

    expect(next.list).toEqual([{ v: 9 }, { v: 2 }]);
  });

  it("does not mutate the input document", () => {
    const doc = { list: [{ v: 1 }] };
    const next = applyDeltas(doc, [
      { op: "replace", path: "/list/0/v", value: 2 },
    ]);

    expect(doc.list[0].v).toBe(1); // input untouched
    expect(next.list[0].v).toBe(2);
    expect(next).not.toBe(doc);
  });
});
