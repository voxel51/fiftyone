import { describe, it, expect } from "vitest";
import {
  addWarning,
  getEmptyValueForType,
  isSchemaIOSchema,
  isJSONSchema,
  type TranslationContext,
} from "./utils";

describe("addWarning", () => {
  it("should add warning to context", () => {
    const context: TranslationContext = {
      warnings: [],
      path: ["field1"],
      strictMode: false,
    };

    addWarning(context, "Test warning");

    expect(context.warnings).toEqual(["Test warning"]);
  });

  it("should throw error in strict mode", () => {
    const context: TranslationContext = {
      warnings: [],
      path: ["field1"],
      strictMode: true,
    };

    expect(() => addWarning(context, "Test error")).toThrow("Test error");
  });

  it("should add multiple warnings", () => {
    const context: TranslationContext = {
      warnings: [],
      path: ["field1"],
      strictMode: false,
    };

    addWarning(context, "Warning 1");
    addWarning(context, "Warning 2");

    expect(context.warnings).toEqual(["Warning 1", "Warning 2"]);
  });
});

describe("getEmptyValueForType", () => {
  it("should return empty string for string type", () => {
    expect(getEmptyValueForType("string")).toBe("");
  });

  it("should return undefined for number type", () => {
    expect(getEmptyValueForType("number")).toBeUndefined();
  });

  it("should return undefined for integer type", () => {
    expect(getEmptyValueForType("integer")).toBeUndefined();
  });

  it("should return false for boolean type", () => {
    expect(getEmptyValueForType("boolean")).toBe(false);
  });

  it("should return empty object for object type", () => {
    expect(getEmptyValueForType("object")).toEqual({});
  });

  it("should return empty array for array type", () => {
    expect(getEmptyValueForType("array")).toEqual([]);
  });

  it("should return null for null type", () => {
    expect(getEmptyValueForType("null")).toBeNull();
  });

  it("should return undefined for unknown type", () => {
    expect(getEmptyValueForType("unknown")).toBeUndefined();
  });
});

describe("isSchemaIOSchema", () => {
  it("should return true for valid SchemaIO schema", () => {
    const schema = {
      type: "string",
      view: { component: "FieldView" },
    };

    expect(isSchemaIOSchema(schema)).toBe(true);
  });

  it("should return false for JSON Schema", () => {
    const schema = {
      type: "string",
      title: "My Field",
    };

    expect(isSchemaIOSchema(schema)).toBe(false);
  });

  it("should return false for null", () => {
    expect(isSchemaIOSchema(null)).toBe(false);
  });

  it("should return false for undefined", () => {
    expect(isSchemaIOSchema(undefined)).toBe(false);
  });

  it("should return false for non-object", () => {
    expect(isSchemaIOSchema("string")).toBe(false);
    expect(isSchemaIOSchema(123)).toBe(false);
  });

  it("should return false for object without view", () => {
    const schema = {
      type: "string",
    };

    expect(isSchemaIOSchema(schema)).toBe(false);
  });

  it("should return false for object without type", () => {
    const schema = {
      view: { component: "FieldView" },
    };

    expect(isSchemaIOSchema(schema)).toBe(false);
  });
});

describe("isJSONSchema", () => {
  it("should return true for valid JSON Schema", () => {
    const schema = {
      type: "string",
      title: "My Field",
    };

    expect(isJSONSchema(schema)).toBe(true);
  });

  it("should return false for SchemaIO schema", () => {
    const schema = {
      type: "string",
      view: { component: "FieldView" },
    };

    expect(isJSONSchema(schema)).toBe(false);
  });

  it("should return false for null", () => {
    expect(isJSONSchema(null)).toBe(false);
  });

  it("should return false for undefined", () => {
    expect(isJSONSchema(undefined)).toBe(false);
  });

  it("should return false for non-object", () => {
    expect(isJSONSchema("string")).toBe(false);
    expect(isJSONSchema(123)).toBe(false);
  });

  it("should return false for object without type", () => {
    const schema = {
      title: "My Field",
    };

    expect(isJSONSchema(schema)).toBe(false);
  });
});
