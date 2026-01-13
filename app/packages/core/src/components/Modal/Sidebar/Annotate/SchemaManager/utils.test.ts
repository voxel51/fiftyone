import { describe, it, expect } from "vitest";
import {
  getAttributeTypeLabel,
  getClassNameError,
  formatAttributeCount,
  formatSchemaCount,
  buildFieldSecondaryContent,
} from "./utils";

describe("getAttributeTypeLabel", () => {
  it("should return human-readable label for known types", () => {
    expect(getAttributeTypeLabel("radio")).toBe("Radio group");
    expect(getAttributeTypeLabel("checkbox")).toBe("Checkbox");
    expect(getAttributeTypeLabel("dropdown")).toBe("Dropdown");
    expect(getAttributeTypeLabel("text")).toBe("Text");
    expect(getAttributeTypeLabel("number")).toBe("Number");
    expect(getAttributeTypeLabel("select")).toBe("Object selector");
  });
});

describe("getClassNameError", () => {
  const existingClasses = ["ClassA", "ClassB", "ClassC"];

  it("should return null for valid class name", () => {
    expect(getClassNameError("NewClass", existingClasses)).toBe(null);
    expect(getClassNameError("AnotherClass", existingClasses)).toBe(null);
  });

  it("should return error for empty class name", () => {
    expect(getClassNameError("", existingClasses)).toBe(
      "Class name cannot be empty"
    );
    expect(getClassNameError("   ", existingClasses)).toBe(
      "Class name cannot be empty"
    );
  });

  it("should return error for duplicate class name", () => {
    expect(getClassNameError("ClassA", existingClasses)).toBe(
      "Class name already exists"
    );
    expect(getClassNameError("ClassB", existingClasses)).toBe(
      "Class name already exists"
    );
  });

  it("should allow current class name when editing", () => {
    expect(getClassNameError("ClassA", existingClasses, "ClassA")).toBe(null);
    expect(getClassNameError("ClassB", existingClasses, "ClassB")).toBe(null);
  });

  it("should still detect duplicates when editing different class", () => {
    expect(getClassNameError("ClassB", existingClasses, "ClassA")).toBe(
      "Class name already exists"
    );
  });

  it("should trim whitespace when checking", () => {
    expect(getClassNameError("  NewClass  ", existingClasses)).toBe(null);
    expect(getClassNameError("  ClassA  ", existingClasses)).toBe(
      "Class name already exists"
    );
  });
});

describe("formatAttributeCount", () => {
  it("should format singular correctly", () => {
    expect(formatAttributeCount(1)).toBe("1 attribute");
  });

  it("should format plural correctly", () => {
    expect(formatAttributeCount(0)).toBe("0 attributes");
    expect(formatAttributeCount(2)).toBe("2 attributes");
    expect(formatAttributeCount(10)).toBe("10 attributes");
  });
});

describe("formatSchemaCount", () => {
  it("should format singular correctly", () => {
    expect(formatSchemaCount(1)).toBe("1 schema");
  });

  it("should format plural correctly", () => {
    expect(formatSchemaCount(0)).toBe("0 schemas");
    expect(formatSchemaCount(2)).toBe("2 schemas");
    expect(formatSchemaCount(5)).toBe("5 schemas");
  });
});

describe("buildFieldSecondaryContent", () => {
  it("should show type only when no attributes and not system read-only", () => {
    expect(buildFieldSecondaryContent("Detection", 0, false)).toBe("Detection");
  });

  it("should show type and attribute count when has attributes", () => {
    expect(buildFieldSecondaryContent("Detection", 3, false)).toBe(
      "Detection • 3 attributes"
    );
    expect(buildFieldSecondaryContent("Classification", 1, false)).toBe(
      "Classification • 1 attribute"
    );
  });

  it("should show 'system' for system read-only fields", () => {
    expect(buildFieldSecondaryContent("Detection", 0, true)).toBe("system");
    expect(buildFieldSecondaryContent("Detection", 5, true)).toBe("system");
  });

  it("should not show attribute count for system read-only fields", () => {
    const result = buildFieldSecondaryContent("Detection", 3, true);
    expect(result).toBe("system");
    expect(result).not.toContain("attribute");
  });
});
