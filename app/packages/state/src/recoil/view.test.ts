import { describe, expect, it, vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");

import { setMockAtoms, TestSelector } from "../../../../__mocks__/recoil";
import * as groups from "./groups";

describe("handles non-nested dynamic groups", () => {
  const testNesting = <TestSelector<typeof groups.isNonNestedDynamicGroup>>(
    (<unknown>groups.isNonNestedDynamicGroup)
  );

  it("resolves as non-nesting", () => {
    setMockAtoms({
      isDynamicGroup: true,
      parentMediaTypeSelector: "image",
    });
    expect(testNesting()).toBe(true);
  });

  it("resolves nesting", () => {
    setMockAtoms({
      isDynamicGroup: true,
      parentMediaTypeSelector: "group",
    });
    expect(testNesting()).toBe(false);
  });
});
