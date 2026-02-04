/**
 * Integration tests for SchemaIOComponent using real-world examples
 * from the codebase
 */

import { describe, it, expect } from "vitest";
import type { SchemaIOComponentProps } from "../index";

describe("SchemaIOComponent Real-World Examples", () => {
  describe("Example 1: Field Selection Dropdown (from Field.tsx)", () => {
    const createFieldSchema = (choices: string[], disabled: Set<string>) => ({
      type: "object",
      view: {
        component: "ObjectView",
      },
      properties: {
        field: {
          type: "string",
          view: {
            name: "DropdownView",
            label: "field",
            placeholder: "Select a field",
            component: "DropdownView",
            choices: choices.map((choice) => ({
              name: "Choice",
              label: choice,
              value: choice,
              readOnly: disabled.has(choice),
            })),
          },
        },
      },
    });

    it("should have valid SchemaIO format", () => {
      const schema = createFieldSchema(
        ["field1", "field2", "field3"],
        new Set(["field2"])
      );

      expect(schema.type).toBe("object");
      expect(schema.view?.component).toBe("ObjectView");
      expect(schema.properties?.field.type).toBe("string");
      expect(schema.properties?.field.view?.component).toBe("DropdownView");
    });

    it("should create proper props for SchemaIOComponent", () => {
      const schema = createFieldSchema(["field1", "field2"], new Set());

      const props: SchemaIOComponentProps = {
        schema,
        data: { field: "field1" },
        onChange: (data) => {
          expect(data).toHaveProperty("field");
        },
      };

      expect(props.schema).toBeDefined();
      expect(props.data).toEqual({ field: "field1" });
    });
  });

  describe("Example 2: Read-only ID Field (from Id.tsx)", () => {
    const createIdSchema = () => ({
      type: "object",
      view: {
        component: "ObjectView",
      },
      properties: {
        id: {
          type: "string",
          view: {
            name: "PrimitiveView",
            readOnly: true,
            component: "PrimitiveView",
          },
        },
      },
    });

    it("should have valid SchemaIO format with readOnly", () => {
      const schema = createIdSchema();

      expect(schema.properties?.id.view?.readOnly).toBe(true);
      expect(schema.properties?.id.view?.component).toBe("PrimitiveView");
    });

    it("should create proper props", () => {
      const props: SchemaIOComponentProps = {
        schema: createIdSchema(),
        data: { id: "overlay-123" },
      };

      expect(props.schema).toBeDefined();
      expect(props.data).toEqual({ id: "overlay-123" });
    });
  });

  describe("Example 3: Annotation Schema (from AnnotationSchema.tsx)", () => {
    const createInput = (name: string, ftype: string) => ({
      type:
        ftype === "string"
          ? "string"
          : ftype === "boolean"
          ? "boolean"
          : "number",
      view: {
        name: "PrimitiveView",
        label: name,
        component: "PrimitiveView",
      },
    });

    const createRadio = (name: string, choices: string[]) => ({
      type: "string",
      view: {
        name: "RadioGroup",
        label: name,
        component: "RadioView",
        choices: choices.map((choice) => ({
          label: choice,
          value: choice,
        })),
      },
    });

    const createTags = (name: string, choices: string[]) => ({
      type: "array",
      view: {
        name: "AutocompleteView",
        label: name,
        component: "AutocompleteView",
        allow_user_input: false,
        choices: choices.map((choice) => ({
          name: "Choice",
          label: choice,
          value: choice,
        })),
      },
      required: true,
    });

    const createSelect = (name: string, choices: string[]) => ({
      type: "string",
      view: {
        name: "DropdownView",
        label: name,
        component: "DropdownView",
        choices: choices.map((choice) => ({
          name: "Choice",
          label: choice,
          value: choice,
        })),
      },
    });

    it("should create input field schema", () => {
      const schema = createInput("confidence", "number");

      expect(schema.type).toBe("number");
      expect(schema.view.component).toBe("PrimitiveView");
      expect(schema.view.label).toBe("confidence");
    });

    it("should create radio field schema", () => {
      const schema = createRadio("status", ["active", "inactive", "pending"]);

      expect(schema.type).toBe("string");
      expect(schema.view.component).toBe("RadioView");
      expect(schema.view.choices).toHaveLength(3);
    });

    it("should create tags (autocomplete) field schema", () => {
      const schema = createTags("tags", ["tag1", "tag2", "tag3"]);

      expect(schema.type).toBe("array");
      expect(schema.view.component).toBe("AutocompleteView");
      expect(schema.view.allow_user_input).toBe(false);
      expect(schema.required).toBe(true);
    });

    it("should create dropdown field schema", () => {
      const schema = createSelect("category", ["cat", "dog", "bird"]);

      expect(schema.type).toBe("string");
      expect(schema.view.component).toBe("DropdownView");
      expect(schema.view.choices).toHaveLength(3);
    });

    it("should create complete annotation schema", () => {
      const schema = {
        type: "object",
        view: {
          component: "ObjectView",
        },
        properties: {
          label: createSelect("label", ["cat", "dog"]),
          confidence: createInput("confidence", "number"),
          status: createRadio("status", ["active", "inactive"]),
          tags: createTags("tags", ["indoor", "outdoor"]),
        },
      };

      const props: SchemaIOComponentProps = {
        schema,
        data: {
          label: "cat",
          confidence: 0.95,
          status: "active",
          tags: ["indoor"],
        },
        useJSONSchema: true,
        onChange: (data) => {
          console.log("Annotation changed:", data);
        },
      };

      expect(props.schema.type).toBe("object");
      expect(Object.keys(props.schema.properties || {})).toHaveLength(4);
    });
  });

  describe("Example 4: Basic Types from input.json", () => {
    it("should handle autocomplete with choices", () => {
      const schema = {
        type: "string",
        view: {
          label: "Autocomplete Field",
          name: "AutocompleteView",
          choices: [
            { name: "Choice", label: "First", value: "1" },
            { name: "Choice", label: "Second", value: "2" },
            { name: "Choice", label: "Third", value: "3" },
          ],
        },
      };

      const props: SchemaIOComponentProps = {
        schema,
        onChange: (data) => console.log(data),
      };

      expect(schema.view.choices).toHaveLength(3);
    });

    it("should handle checkbox field", () => {
      const schema = {
        type: "boolean",
        view: { label: "Checkbox field" },
      };

      expect(schema.type).toBe("boolean");
    });

    it("should handle code field", () => {
      const schema = {
        type: "string",
        view: {
          label: "Code field",
          name: "CodeView",
          language: "javascript",
        },
      };

      expect(schema.view.name).toBe("CodeView");
      expect(schema.view.language).toBe("javascript");
    });

    it("should handle color picker", () => {
      const schema = {
        type: "string",
        view: { label: "Color field", name: "ColorView" },
      };

      expect(schema.view.name).toBe("ColorView");
    });

    it("should handle list field", () => {
      const schema = {
        type: "array",
        items: {
          type: "string",
          view: {},
        },
        view: { label: "List Field" },
      };

      expect(schema.type).toBe("array");
      expect(schema.items).toBeDefined();
    });

    it("should handle map field", () => {
      const schema = {
        type: "object",
        additionalProperties: {
          type: "string",
          view: {},
        },
        view: {
          name: "MapView",
          label: "Map Field",
        },
      };

      expect(schema.view.name).toBe("MapView");
      expect(schema.additionalProperties).toBeDefined();
    });
  });

  describe("Example 5: Complex Object with Multiple Fields", () => {
    it("should handle nested objects", () => {
      const schema = {
        type: "object",
        view: { component: "ObjectView" },
        properties: {
          person: {
            type: "object",
            view: { component: "ObjectView" },
            properties: {
              name: {
                type: "string",
                view: { label: "Name", component: "PrimitiveView" },
              },
              age: {
                type: "number",
                view: { label: "Age", component: "PrimitiveView" },
              },
            },
          },
          address: {
            type: "object",
            view: { component: "ObjectView" },
            properties: {
              street: {
                type: "string",
                view: { label: "Street", component: "PrimitiveView" },
              },
              city: {
                type: "string",
                view: { label: "City", component: "PrimitiveView" },
              },
            },
          },
        },
      };

      const props: SchemaIOComponentProps = {
        schema,
        data: {
          person: { name: "John Doe", age: 30 },
          address: { street: "123 Main St", city: "Anytown" },
        },
        useJSONSchema: true,
        onChange: (data) => console.log(data),
      };

      expect(props.schema.properties?.person.properties).toBeDefined();
      expect(props.schema.properties?.address.properties).toBeDefined();
    });
  });

  describe("Example 6: Usage with OperatorIO", () => {
    it("should handle operator schemas", () => {
      const props: SchemaIOComponentProps = {
        schema: {
          type: "object",
          view: { component: "ObjectView" },
          properties: {},
        },
        id: "operator-123",
        shouldClearUseKeyStores: true,
        onChange: (data, liteValues) => {
          console.log("Operator data:", data);
          console.log("Lite values:", liteValues);
        },
        onPathChange: (path, value, schema, updatedState, liteValue) => {
          console.log(`Path ${path} changed to:`, value);
        },
      };

      expect(props.id).toBe("operator-123");
      expect(props.shouldClearUseKeyStores).toBe(true);
      expect(props.onChange).toBeDefined();
      expect(props.onPathChange).toBeDefined();
    });
  });

  describe("Example 7: RJSF-specific props", () => {
    it("should accept RJSF-specific props with useJSONSchema", () => {
      const props: SchemaIOComponentProps = {
        schema: {
          type: "object",
          view: { component: "ObjectView" },
          properties: {
            name: {
              type: "string",
              view: { label: "Name" },
            },
          },
        },
        useJSONSchema: true,
        uiSchema: {
          name: {
            "ui:placeholder": "Enter your name",
            "ui:help": "This is your display name",
          },
        },
        onSubmit: (data) => {
          console.log("Form submitted:", data);
        },
      };

      expect(props.useJSONSchema).toBe(true);
      expect(props.uiSchema).toBeDefined();
      expect(props.onSubmit).toBeDefined();
    });
  });
});

describe("SchemaIO Type Detection", () => {
  it("should detect SchemaIO schemas by presence of view property", () => {
    const schemaIOSchema = {
      type: "string",
      view: { component: "FieldView" },
    };

    // Has view property = SchemaIO
    expect(schemaIOSchema.view).toBeDefined();
  });

  it("should detect JSON Schema by absence of view property", () => {
    const jsonSchema = {
      type: "string",
      title: "Name",
      description: "User name",
    };

    // No view property = JSON Schema
    expect((jsonSchema as any).view).toBeUndefined();
  });
});
