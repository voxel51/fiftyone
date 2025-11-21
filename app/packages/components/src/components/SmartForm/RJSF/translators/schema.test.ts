import { describe, it, expect } from "vitest";
import { translateToJSONSchema, addChoicesToSchema } from "./schema";
import type { TranslationContext } from "./utils";

describe("translateToJSONSchema", () => {
  const baseContext: TranslationContext = {
    warnings: [],
    path: [],
    strictMode: false,
  };

  describe("primitive types", () => {
    it("should translate string type", () => {
      const schemaIO = { type: "string" };
      const result = translateToJSONSchema(schemaIO, baseContext);

      expect(result.type).toBe("string");
    });

    it("should translate number type", () => {
      const schemaIO = { type: "number", min: 0, max: 100 };
      const result = translateToJSONSchema(schemaIO, baseContext);

      expect(result.type).toBe("number");
      expect(result.minimum).toBe(0);
      expect(result.maximum).toBe(100);
    });

    it("should translate integer type with multipleOf", () => {
      const schemaIO = { type: "integer", multipleOf: 5 };
      const result = translateToJSONSchema(schemaIO, baseContext);

      expect(result.type).toBe("number");
      expect(result.multipleOf).toBe(5);
    });

    it("should translate boolean type", () => {
      const schemaIO = { type: "boolean" };
      const result = translateToJSONSchema(schemaIO, baseContext);

      expect(result.type).toBe("boolean");
    });

    it("should translate null type", () => {
      const schemaIO = { type: "null" };
      const result = translateToJSONSchema(schemaIO, baseContext);

      expect(result.type).toBe("null");
    });
  });

  describe("default values", () => {
    it("should add default value", () => {
      const schemaIO = { type: "string", default: "test" };
      const result = translateToJSONSchema(schemaIO, baseContext);

      expect(result.default).toBe("test");
    });

    it("should not add null default value", () => {
      const schemaIO = { type: "string", default: null };
      const result = translateToJSONSchema(schemaIO, baseContext);

      expect(result.default).toBeUndefined();
    });
  });

  describe("view metadata", () => {
    it("should add title from view label", () => {
      const schemaIO = {
        type: "string",
        view: { label: "Field Label" },
      };
      const result = translateToJSONSchema(schemaIO, baseContext);

      expect(result.title).toBe("Field Label");
    });

    it("should add description from view", () => {
      const schemaIO = {
        type: "string",
        view: { description: "Field description" },
      };
      const result = translateToJSONSchema(schemaIO, baseContext);

      expect(result.description).toBe("Field description");
    });
  });

  describe("object types", () => {
    it("should translate object with properties", () => {
      const schemaIO = {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
      };
      const result = translateToJSONSchema(schemaIO, baseContext);

      expect(result.type).toBe("object");
      expect(result.properties).toBeDefined();
      expect(result.properties?.name).toEqual({ type: "string" });
      expect(result.properties?.age).toEqual({ type: "number" });
    });

    it("should collect required fields", () => {
      const schemaIO = {
        type: "object",
        properties: {
          name: { type: "string", required: true },
          age: { type: "number" },
          email: { type: "string", required: true },
        },
      };
      const result = translateToJSONSchema(schemaIO, baseContext);

      expect(result.required).toEqual(["name", "email"]);
    });

    it("should handle additionalProperties", () => {
      const schemaIO = {
        type: "object",
        additionalProperties: { type: "string" },
      };
      const result = translateToJSONSchema(schemaIO, baseContext);

      expect(result.additionalProperties).toEqual({ type: "string" });
    });
  });

  describe("array types", () => {
    it("should translate array with single item type", () => {
      const schemaIO = {
        type: "array",
        items: { type: "string" },
      };
      const result = translateToJSONSchema(schemaIO, baseContext);

      expect(result.type).toBe("array");
      expect(result.items).toEqual({ type: "string" });
    });

    it("should translate tuple-style array", () => {
      const schemaIO = {
        type: "array",
        items: [{ type: "string" }, { type: "number" }],
      };
      const result = translateToJSONSchema(schemaIO, baseContext);

      expect(result.type).toBe("array");
      expect(result.items).toEqual([{ type: "string" }, { type: "number" }]);
      expect(result.minItems).toBe(2);
      expect(result.maxItems).toBe(2);
    });
  });

  describe("oneOf types", () => {
    it("should translate oneOf", () => {
      const schemaIO = {
        type: "oneOf",
        types: [{ type: "string" }, { type: "number" }],
      };
      const result = translateToJSONSchema(schemaIO, baseContext);

      expect(result.oneOf).toEqual([{ type: "string" }, { type: "number" }]);
    });
  });

  describe("unsupported types", () => {
    it("should add warning for unsupported type", () => {
      const context = { ...baseContext, warnings: [] };
      const schemaIO = { type: "unsupported" };

      translateToJSONSchema(schemaIO, context);

      expect(context.warnings).toHaveLength(1);
      expect(context.warnings[0]).toContain("Unsupported type");
    });

    it("should throw error in strict mode", () => {
      const context = { ...baseContext, strictMode: true };
      const schemaIO = { type: "unsupported" };

      expect(() => translateToJSONSchema(schemaIO, context)).toThrow();
    });
  });
});

describe("addChoicesToSchema", () => {
  it("should add enum from choices for non-array types", () => {
    const schema = { type: "string" };
    const schemaIO = {
      type: "string",
      view: {
        choices: [
          { value: "a", label: "Option A" },
          { value: "b", label: "Option B" },
        ],
      },
    };

    const result = addChoicesToSchema(schema, schemaIO);

    expect(result.enum).toEqual(["a", "b"]);
    expect(result.enumNames).toEqual(["Option A", "Option B"]);
  });

  it("should add items for array types with choices", () => {
    const schema = { type: "array" };
    const schemaIO = {
      type: "array",
      view: {
        choices: [
          { value: "a", label: "Option A" },
          { value: "b", label: "Option B" },
        ],
      },
    };

    const result = addChoicesToSchema(schema, schemaIO);

    expect(result.items).toEqual({
      type: "string",
      enum: ["a", "b"],
      enumNames: ["Option A", "Option B"],
    });
    expect(result.examples).toEqual(["a", "b"]);
  });

  it("should add default items for AutocompleteView arrays without choices", () => {
    const schema = { type: "array" };
    const schemaIO = {
      type: "array",
      view: { component: "AutocompleteView" },
    };

    const result = addChoicesToSchema(schema, schemaIO);

    expect(result.items).toEqual({ type: "string" });
  });

  it("should recursively process object properties", () => {
    const schema = {
      type: "object",
      properties: {
        field1: { type: "string" },
      },
    };
    const schemaIO = {
      type: "object",
      properties: {
        field1: {
          type: "string",
          view: {
            choices: [
              { value: "a", label: "A" },
              { value: "b", label: "B" },
            ],
          },
        },
      },
    };

    const result = addChoicesToSchema(schema, schemaIO);

    expect(result.properties?.field1.enum).toEqual(["a", "b"]);
  });

  it("should recursively process array items", () => {
    const schema = {
      type: "array",
      items: { type: "string" },
    };
    const schemaIO = {
      type: "array",
      items: {
        type: "string",
        view: {
          choices: [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
          ],
        },
      },
    };

    const result = addChoicesToSchema(schema, schemaIO);

    expect(result.items).toHaveProperty("enum", ["a", "b"]);
  });

  it("should use value as label if label is missing", () => {
    const schema = { type: "string" };
    const schemaIO = {
      type: "string",
      view: {
        choices: [{ value: "a" }, { value: "b" }],
      },
    };

    const result = addChoicesToSchema(schema, schemaIO);

    expect(result.enumNames).toEqual(["a", "b"]);
  });
});
