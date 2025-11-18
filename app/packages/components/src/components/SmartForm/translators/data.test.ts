import { describe, it, expect } from "vitest";
import {
  convertSchemaIODataToRJSF,
  convertRJSFDataToSchemaIO,
} from "./data";
import type { SchemaType } from "@fiftyone/core/src/plugins/SchemaIO/utils/types";

describe("convertSchemaIODataToRJSF", () => {
  describe("null and undefined handling", () => {
    it("should convert null to empty string for string type", () => {
      const schema: SchemaType = { type: "string", view: {} };
      expect(convertSchemaIODataToRJSF(null, schema)).toBe("");
    });

    it("should convert undefined to empty string for string type", () => {
      const schema: SchemaType = { type: "string", view: {} };
      expect(convertSchemaIODataToRJSF(undefined, schema)).toBe("");
    });

    it("should convert null to undefined for number type", () => {
      const schema: SchemaType = { type: "number", view: {} };
      expect(convertSchemaIODataToRJSF(null, schema)).toBeUndefined();
    });

    it("should convert null to false for boolean type", () => {
      const schema: SchemaType = { type: "boolean", view: {} };
      expect(convertSchemaIODataToRJSF(null, schema)).toBe(false);
    });

    it("should convert null to empty object for object type", () => {
      const schema: SchemaType = { type: "object", view: {} };
      expect(convertSchemaIODataToRJSF(null, schema)).toEqual({});
    });

    it("should convert null to empty array for array type", () => {
      const schema: SchemaType = { type: "array", view: {} };
      expect(convertSchemaIODataToRJSF(null, schema)).toEqual([]);
    });
  });

  describe("primitive types", () => {
    it("should pass through string values", () => {
      const schema: SchemaType = { type: "string", view: {} };
      expect(convertSchemaIODataToRJSF("test", schema)).toBe("test");
    });

    it("should pass through number values", () => {
      const schema: SchemaType = { type: "number", view: {} };
      expect(convertSchemaIODataToRJSF(42, schema)).toBe(42);
    });

    it("should pass through boolean values", () => {
      const schema: SchemaType = { type: "boolean", view: {} };
      expect(convertSchemaIODataToRJSF(true, schema)).toBe(true);
    });
  });

  describe("object types", () => {
    it("should convert object with properties", () => {
      const schema: SchemaType = {
        type: "object",
        view: {},
        properties: {
          name: { type: "string", view: {} },
          age: { type: "number", view: {} },
        },
      };
      const data = { name: "John", age: 30 };

      const result = convertSchemaIODataToRJSF(data, schema);

      expect(result).toEqual({ name: "John", age: 30 });
    });

    it("should convert nested objects", () => {
      const schema: SchemaType = {
        type: "object",
        view: {},
        properties: {
          person: {
            type: "object",
            view: {},
            properties: {
              name: { type: "string", view: {} },
            },
          },
        },
      };
      const data = { person: { name: "John" } };

      const result = convertSchemaIODataToRJSF(data, schema);

      expect(result).toEqual({ person: { name: "John" } });
    });

    it("should handle null property values", () => {
      const schema: SchemaType = {
        type: "object",
        view: {},
        properties: {
          name: { type: "string", view: {} },
          age: { type: "number", view: {} },
        },
      };
      const data = { name: "John", age: null };

      const result = convertSchemaIODataToRJSF(data, schema);

      expect(result).toEqual({ name: "John", age: undefined });
    });

    it("should return empty object for array data", () => {
      const schema: SchemaType = { type: "object", view: {} };
      const result = convertSchemaIODataToRJSF([], schema);

      expect(result).toEqual({});
    });

    it("should handle objects without properties schema", () => {
      const schema: SchemaType = { type: "object", view: {} };
      const data = { name: "John", age: 30 };

      const result = convertSchemaIODataToRJSF(data, schema);

      expect(result).toEqual({ name: "John", age: 30 });
    });
  });

  describe("array types", () => {
    it("should convert array with single item type", () => {
      const schema: SchemaType = {
        type: "array",
        view: {},
        items: { type: "string", view: {} },
      };
      const data = ["a", "b", "c"];

      const result = convertSchemaIODataToRJSF(data, schema);

      expect(result).toEqual(["a", "b", "c"]);
    });

    it("should convert tuple array", () => {
      const schema: SchemaType = {
        type: "array",
        view: {},
        items: [
          { type: "string", view: {} },
          { type: "number", view: {} },
        ],
      };
      const data = ["test", 42];

      const result = convertSchemaIODataToRJSF(data, schema);

      expect(result).toEqual(["test", 42]);
    });

    it("should convert array of objects", () => {
      const schema: SchemaType = {
        type: "array",
        view: {},
        items: {
          type: "object",
          view: {},
          properties: {
            name: { type: "string", view: {} },
          },
        },
      };
      const data = [{ name: "John" }, { name: "Jane" }];

      const result = convertSchemaIODataToRJSF(data, schema);

      expect(result).toEqual([{ name: "John" }, { name: "Jane" }]);
    });

    it("should return empty array for non-array data", () => {
      const schema: SchemaType = { type: "array", view: {} };
      const result = convertSchemaIODataToRJSF("not an array", schema);

      expect(result).toEqual([]);
    });
  });

  describe("oneOf types", () => {
    it("should pass through data for oneOf", () => {
      const schema: SchemaType = { type: "oneOf", view: {} };
      const data = { value: "test" };

      const result = convertSchemaIODataToRJSF(data, schema);

      expect(result).toEqual({ value: "test" });
    });
  });
});

describe("convertRJSFDataToSchemaIO", () => {
  describe("null and undefined handling", () => {
    it("should convert null to null", () => {
      const schema: SchemaType = { type: "string", view: {} };
      expect(convertRJSFDataToSchemaIO(null, schema)).toBeNull();
    });

    it("should convert undefined to null", () => {
      const schema: SchemaType = { type: "string", view: {} };
      expect(convertRJSFDataToSchemaIO(undefined, schema)).toBeNull();
    });
  });

  describe("primitive types", () => {
    it("should pass through string values", () => {
      const schema: SchemaType = { type: "string", view: {} };
      expect(convertRJSFDataToSchemaIO("test", schema)).toBe("test");
    });

    it("should pass through number values", () => {
      const schema: SchemaType = { type: "number", view: {} };
      expect(convertRJSFDataToSchemaIO(42, schema)).toBe(42);
    });

    it("should pass through boolean values", () => {
      const schema: SchemaType = { type: "boolean", view: {} };
      expect(convertRJSFDataToSchemaIO(true, schema)).toBe(true);
    });
  });

  describe("coerceEmpty option", () => {
    it("should convert empty string to null when coerceEmpty is true", () => {
      const schema: SchemaType = { type: "string", view: {} };
      const result = convertRJSFDataToSchemaIO("", schema, {
        coerceEmpty: true,
      });

      expect(result).toBeNull();
    });

    it("should keep empty string when coerceEmpty is false", () => {
      const schema: SchemaType = { type: "string", view: {} };
      const result = convertRJSFDataToSchemaIO("", schema, {
        coerceEmpty: false,
      });

      expect(result).toBe("");
    });

    it("should convert empty array to null when coerceEmpty is true", () => {
      const schema: SchemaType = { type: "array", view: {} };
      const result = convertRJSFDataToSchemaIO([], schema, {
        coerceEmpty: true,
      });

      expect(result).toBeNull();
    });

    it("should keep empty array when coerceEmpty is false", () => {
      const schema: SchemaType = { type: "array", view: {} };
      const result = convertRJSFDataToSchemaIO([], schema, {
        coerceEmpty: false,
      });

      expect(result).toEqual([]);
    });
  });

  describe("object types", () => {
    it("should convert object with properties", () => {
      const schema: SchemaType = {
        type: "object",
        view: {},
        properties: {
          name: { type: "string", view: {} },
          age: { type: "number", view: {} },
        },
      };
      const formData = { name: "John", age: 30 };

      const result = convertRJSFDataToSchemaIO(formData, schema);

      expect(result).toEqual({ name: "John", age: 30 });
    });

    it("should convert nested objects", () => {
      const schema: SchemaType = {
        type: "object",
        view: {},
        properties: {
          person: {
            type: "object",
            view: {},
            properties: {
              name: { type: "string", view: {} },
            },
          },
        },
      };
      const formData = { person: { name: "John" } };

      const result = convertRJSFDataToSchemaIO(formData, schema);

      expect(result).toEqual({ person: { name: "John" } });
    });

    it("should return null for non-object data", () => {
      const schema: SchemaType = { type: "object", view: {} };
      const result = convertRJSFDataToSchemaIO("not an object", schema);

      expect(result).toBeNull();
    });

    it("should return null for array data", () => {
      const schema: SchemaType = { type: "object", view: {} };
      const result = convertRJSFDataToSchemaIO([], schema);

      expect(result).toBeNull();
    });

    it("should return null for empty object", () => {
      const schema: SchemaType = {
        type: "object",
        view: {},
        properties: {},
      };
      const result = convertRJSFDataToSchemaIO({}, schema);

      expect(result).toBeNull();
    });

    it("should handle objects without properties schema", () => {
      const schema: SchemaType = { type: "object", view: {} };
      const formData = { name: "John", age: 30 };

      const result = convertRJSFDataToSchemaIO(formData, schema);

      expect(result).toEqual({ name: "John", age: 30 });
    });
  });

  describe("array types", () => {
    it("should convert array with single item type", () => {
      const schema: SchemaType = {
        type: "array",
        view: {},
        items: { type: "string", view: {} },
      };
      const formData = ["a", "b", "c"];

      const result = convertRJSFDataToSchemaIO(formData, schema);

      expect(result).toEqual(["a", "b", "c"]);
    });

    it("should convert tuple array", () => {
      const schema: SchemaType = {
        type: "array",
        view: {},
        items: [
          { type: "string", view: {} },
          { type: "number", view: {} },
        ],
      };
      const formData = ["test", 42];

      const result = convertRJSFDataToSchemaIO(formData, schema);

      expect(result).toEqual(["test", 42]);
    });

    it("should convert array of objects", () => {
      const schema: SchemaType = {
        type: "array",
        view: {},
        items: {
          type: "object",
          view: {},
          properties: {
            name: { type: "string", view: {} },
          },
        },
      };
      const formData = [{ name: "John" }, { name: "Jane" }];

      const result = convertRJSFDataToSchemaIO(formData, schema);

      expect(result).toEqual([{ name: "John" }, { name: "Jane" }]);
    });

    it("should return null for non-array data", () => {
      const schema: SchemaType = { type: "array", view: {} };
      const result = convertRJSFDataToSchemaIO("not an array", schema);

      expect(result).toBeNull();
    });
  });
});
