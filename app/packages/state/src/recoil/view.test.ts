import { describe, expect, it, vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");

import { setMockAtoms, TestSelector } from "../../../../__mocks__/recoil";
import * as view from "./view";

describe("handles non-nested dynamic groups", () => {
  const testNesting = <TestSelector<typeof view.isNonNestedDynamicGroup>>(
    (<unknown>view.isNonNestedDynamicGroup)
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
