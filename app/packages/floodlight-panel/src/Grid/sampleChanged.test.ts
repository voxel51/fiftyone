import { describe, expect, test } from "vitest";
import { sampleChanged } from "./sampleChanged";

describe("sampleChanged", () => {
  test("the same record is unchanged", () => {
    const sample = { last_modified_at: "t1", tags: ["a"] };
    expect(sampleChanged(sample, sample)).toBe(false);
  });

  test("a refetch with the same modification time is unchanged", () => {
    expect(
      sampleChanged(
        { last_modified_at: { $date: 1 }, tags: ["a"] },
        { last_modified_at: { $date: 1 }, tags: ["a"] },
      ),
    ).toBe(false);
  });

  test("a later modification time is a change", () => {
    expect(
      sampleChanged({ last_modified_at: "t1" }, { last_modified_at: "t2" }),
    ).toBe(true);
  });

  test("without modification times, new tags are a change", () => {
    expect(sampleChanged({ tags: ["a"] }, { tags: ["a", "b"] })).toBe(true);
    expect(sampleChanged({ tags: ["a"] }, { tags: ["a"] })).toBe(false);
  });
});
