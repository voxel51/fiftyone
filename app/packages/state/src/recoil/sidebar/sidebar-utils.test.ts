import { describe, expect, it, vi } from "vitest";

vi.mock("recoil");
vi.mock("recoil-relay");

import { merge, mergeGroups } from "./sidebar-utils";

describe("test sidebar groups resolution", () => {
  it("test list merge", () => {
    expect(merge([], ["one", "two"])).toStrictEqual(["one", "two"]);
  });

  it("merges current and config groups", () => {
    expect(
      mergeGroups(
        [
          { name: "one", paths: ["one.one", "one.three"] },
          { name: "three", paths: [] },
        ],

        [
          { name: "zero", paths: [] },
          {
            name: "one",
            paths: ["one.zero", "one.one", "one.two"],
          },
          { name: "two", paths: [] },
        ]
      )
    ).toStrictEqual([
      { name: "zero", paths: [] },
      { name: "one", paths: ["one.zero", "one.one", "one.two", "one.three"] },
      { name: "two", paths: [] },
      { name: "three", paths: [] },
    ]);
  });
});
