import { describe, expect, it } from "vitest";
import { filterEmptyArrays } from "./index";

describe("filterEmptyArrays", () => {
  it("should remove empty arrays that don't exist in original data", () => {
    const formData = {
      name: "John",
      tags: [],
      items: [],
    };
    const originalData = {
      name: "John",
    };

    const result = filterEmptyArrays(formData, originalData);

    expect(result).toEqual({
      name: "John",
    });
    expect(result).not.toHaveProperty("tags");
    expect(result).not.toHaveProperty("items");
  });
});
