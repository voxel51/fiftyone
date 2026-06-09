import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchAndMergeOntologyAttributes,
  formatAttributeCount,
  formatSchemaCount,
  getAttributeTypeLabel,
  getClassNameError,
  type AttributeConfig,
} from "./utils";

const mockFetch = vi.fn();
vi.mock("@fiftyone/utilities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@fiftyone/utilities")>();
  return { ...actual, getFetchFunction: () => mockFetch };
});

describe("getAttributeTypeLabel", () => {
  it("should return human-readable label for known components", () => {
    expect(getAttributeTypeLabel("checkbox")).toBe("Checkbox");
    expect(getAttributeTypeLabel("checkboxes")).toBe("Checkboxes");
    expect(getAttributeTypeLabel("datepicker")).toBe("Date picker");
    expect(getAttributeTypeLabel("dropdown")).toBe("Dropdown");
    expect(getAttributeTypeLabel("json")).toBe("JSON");
    expect(getAttributeTypeLabel("radio")).toBe("Radio group");
    expect(getAttributeTypeLabel("slider")).toBe("Slider");
    expect(getAttributeTypeLabel("text")).toBe("Text");
    expect(getAttributeTypeLabel("toggle")).toBe("Toggle");
  });

  it("should return human-readable label for known types", () => {
    expect(getAttributeTypeLabel("bool")).toBe("Boolean");
    expect(getAttributeTypeLabel("list<bool>")).toBe("Boolean list");
    expect(getAttributeTypeLabel("date")).toBe("Date");
    expect(getAttributeTypeLabel("datetime")).toBe("Date/time");
    expect(getAttributeTypeLabel("dict")).toBe("Dictionary");
    expect(getAttributeTypeLabel("float")).toBe("Float");
    expect(getAttributeTypeLabel("list<float>")).toBe("Float list");
    expect(getAttributeTypeLabel("id")).toBe("ID");
    expect(getAttributeTypeLabel("int")).toBe("Integer");
    expect(getAttributeTypeLabel("list<int>")).toBe("Integer list");
    expect(getAttributeTypeLabel("str")).toBe("String");
    expect(getAttributeTypeLabel("list<str>")).toBe("String list");
  });

  it("should return the type as-is for unknown types", () => {
    expect(getAttributeTypeLabel("custom")).toBe("custom");
    expect(getAttributeTypeLabel("unknown")).toBe("unknown");
    expect(getAttributeTypeLabel("")).toBe("");
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

describe("fetchAndMergeOntologyAttributes", () => {
  const attr = (name: string, extra: Partial<AttributeConfig> = {}) =>
    ({ name, type: "str", ...extra } as AttributeConfig);

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("appends new ontology attributes after existing ones", async () => {
    mockFetch.mockResolvedValue({
      attributes: [attr("size", { _source: "vehicles" })],
    });

    const merged = await fetchAndMergeOntologyAttributes(
      [attr("color")],
      "vehicles"
    );

    expect(merged.map((a) => a.name)).toEqual(["color", "size"]);
    expect(merged.find((a) => a.name === "size")?._source).toBe("vehicles");
  });

  it("overrides same-named attributes in place, preserving order", async () => {
    mockFetch.mockResolvedValue({
      attributes: [attr("color", { _source: "vehicles", component: "radio" })],
    });

    const merged = await fetchAndMergeOntologyAttributes(
      [attr("color"), attr("year")],
      "vehicles"
    );

    expect(merged.map((a) => a.name)).toEqual(["color", "year"]);
    expect(merged[0]._source).toBe("vehicles");
    expect(merged[0].component).toBe("radio");
  });

  it("returns the existing list unchanged when the ontology has no attributes", async () => {
    mockFetch.mockResolvedValue({ attributes: [] });

    const existing = [attr("color")];
    const merged = await fetchAndMergeOntologyAttributes(existing, "empty");

    expect(merged).toBe(existing);
  });
});
