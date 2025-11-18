import { describe, it, expect } from "vitest";
import {
  translateSchema,
  translateSchemaComplete,
  isSchemaIOSchema,
  isJSONSchema,
} from "./index";
import type { SchemaType } from "@fiftyone/core/src/plugins/SchemaIO/utils/types";

describe("translateSchema", () => {
  it("should translate a simple SchemaIO schema", () => {
    const schemaIO: SchemaType = {
      type: "string",
      view: {
        component: "FieldView",
        label: "Name",
        description: "Enter your name",
      },
    };

    const result = translateSchema(schemaIO);

    expect(result.schema.type).toBe("string");
    expect(result.schema.title).toBe("Name");
    expect(result.schema.description).toBe("Enter your name");
    expect(result.warnings).toEqual([]);
  });

  it("should translate a complex object schema", () => {
    const schemaIO: SchemaType = {
      type: "object",
      view: { component: "ObjectView" },
      properties: {
        name: {
          type: "string",
          view: { component: "FieldView", label: "Name" },
          required: true,
        },
        age: {
          type: "number",
          view: { component: "FieldView", label: "Age" },
          min: 0,
          max: 120,
        },
        email: {
          type: "string",
          view: { component: "FieldView", label: "Email" },
        },
      },
    };

    const result = translateSchema(schemaIO);

    expect(result.schema.type).toBe("object");
    expect(result.schema.properties).toBeDefined();
    expect(result.schema.properties?.name.type).toBe("string");
    expect(result.schema.properties?.age.type).toBe("number");
    expect(result.schema.properties?.age.minimum).toBe(0);
    expect(result.schema.properties?.age.maximum).toBe(120);
    expect(result.schema.required).toEqual(["name"]);
    expect(result.warnings).toEqual([]);
  });

  it("should generate UI schema", () => {
    const schemaIO: SchemaType = {
      type: "string",
      view: {
        component: "FieldView",
        placeholder: "Enter text",
        caption: "Help text",
      },
    };

    const result = translateSchema(schemaIO);

    expect(result.uiSchema["ui:placeholder"]).toBe("Enter text");
    expect(result.uiSchema["ui:help"]).toBe("Help text");
  });

  it("should collect warnings for unsupported types", () => {
    const schemaIO: any = {
      type: "custom",
      view: { component: "CustomView" },
    };

    const result = translateSchema(schemaIO);

    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("should respect strict mode", () => {
    const schemaIO: any = {
      type: "unsupported",
      view: { component: "CustomView" },
    };

    expect(() =>
      translateSchema(schemaIO, { strictMode: true })
    ).toThrow();
  });
});

describe("translateSchemaComplete", () => {
  it("should translate schema and add choices", () => {
    const schemaIO: SchemaType = {
      type: "string",
      view: {
        component: "DropdownView",
        choices: [
          { value: "a", label: "Option A" },
          { value: "b", label: "Option B" },
        ],
      },
    };

    const result = translateSchemaComplete(schemaIO);

    expect(result.schema.enum).toEqual(["a", "b"]);
    expect(result.schema.enumNames).toEqual(["Option A", "Option B"]);
    expect(result.uiSchema["ui:widget"]).toBe("Dropdown");
  });

  it("should convert data when provided", () => {
    const schemaIO: SchemaType = {
      type: "object",
      view: { component: "ObjectView" },
      properties: {
        name: { type: "string", view: {} },
        age: { type: "number", view: {} },
      },
    };
    const data = { name: "John", age: 30 };

    const result = translateSchemaComplete(schemaIO, data);

    expect(result.formData).toEqual({ name: "John", age: 30 });
  });

  it("should handle null data conversion", () => {
    const schemaIO: SchemaType = {
      type: "object",
      view: { component: "ObjectView" },
      properties: {
        name: { type: "string", view: {} },
        age: { type: "number", view: {} },
      },
    };
    const data = { name: "John", age: null };

    const result = translateSchemaComplete(schemaIO, data);

    expect(result.formData).toEqual({ name: "John", age: undefined });
  });

  it("should not convert data when not provided", () => {
    const schemaIO: SchemaType = {
      type: "string",
      view: { component: "FieldView" },
    };

    const result = translateSchemaComplete(schemaIO);

    expect(result.formData).toBeUndefined();
  });

  it("should handle array types with choices", () => {
    const schemaIO: SchemaType = {
      type: "array",
      view: {
        component: "AutocompleteView",
        choices: [
          { value: "tag1", label: "Tag 1" },
          { value: "tag2", label: "Tag 2" },
        ],
      },
    };

    const result = translateSchemaComplete(schemaIO);

    expect(result.schema.type).toBe("array");
    expect(result.schema.items).toBeDefined();
    expect((result.schema.items as any).enum).toEqual(["tag1", "tag2"]);
    expect(result.schema.examples).toEqual(["tag1", "tag2"]);
  });

  it("should handle AutocompleteView without choices", () => {
    const schemaIO: SchemaType = {
      type: "array",
      view: { component: "AutocompleteView" },
    };

    const result = translateSchemaComplete(schemaIO);

    expect(result.schema.type).toBe("array");
    expect(result.schema.items).toEqual({ type: "string" });
  });
});

describe("end-to-end integration", () => {
  it("should handle a complete form schema", () => {
    const schemaIO: SchemaType = {
      type: "object",
      view: { component: "ObjectView" },
      properties: {
        username: {
          type: "string",
          view: {
            component: "FieldView",
            label: "Username",
            placeholder: "Enter username",
          },
          required: true,
        },
        email: {
          type: "string",
          view: {
            component: "FieldView",
            label: "Email",
            placeholder: "your@email.com",
          },
          required: true,
        },
        role: {
          type: "string",
          view: {
            component: "DropdownView",
            label: "Role",
            choices: [
              { value: "admin", label: "Administrator" },
              { value: "user", label: "Regular User" },
            ],
          },
        },
        tags: {
          type: "array",
          view: {
            component: "AutocompleteView",
            label: "Tags",
            choices: [
              { value: "dev", label: "Developer" },
              { value: "qa", label: "QA Tester" },
            ],
          },
        },
        active: {
          type: "boolean",
          view: {
            component: "CheckboxView",
            label: "Active",
          },
        },
      },
    };

    const data = {
      username: "john_doe",
      email: "john@example.com",
      role: "admin",
      tags: ["dev"],
      active: true,
    };

    const result = translateSchemaComplete(schemaIO, data);

    // Check schema
    expect(result.schema.type).toBe("object");
    expect(result.schema.required).toEqual(["username", "email"]);
    expect(result.schema.properties?.role.enum).toEqual(["admin", "user"]);
    expect((result.schema.properties?.tags as any).items.enum).toEqual([
      "dev",
      "qa",
    ]);

    // Check UI schema
    expect(result.uiSchema.username?.["ui:placeholder"]).toBe(
      "Enter username"
    );
    expect(result.uiSchema.email?.["ui:placeholder"]).toBe("your@email.com");
    expect(result.uiSchema.role?.["ui:widget"]).toBe("Dropdown");
    expect(result.uiSchema.tags?.["ui:widget"]).toBe("AutoComplete");
    expect(result.uiSchema.active?.["ui:widget"]).toBe("checkbox");

    // Check converted data
    expect(result.formData).toEqual(data);

    // Check no warnings
    expect(result.warnings).toEqual([]);
  });

  it("should handle nested objects", () => {
    const schemaIO: SchemaType = {
      type: "object",
      view: { component: "ObjectView" },
      properties: {
        person: {
          type: "object",
          view: { component: "ObjectView" },
          properties: {
            firstName: {
              type: "string",
              view: { component: "FieldView", label: "First Name" },
            },
            lastName: {
              type: "string",
              view: { component: "FieldView", label: "Last Name" },
            },
          },
        },
        address: {
          type: "object",
          view: { component: "ObjectView" },
          properties: {
            street: {
              type: "string",
              view: { component: "FieldView", label: "Street" },
            },
            city: {
              type: "string",
              view: { component: "FieldView", label: "City" },
            },
          },
        },
      },
    };

    const data = {
      person: { firstName: "John", lastName: "Doe" },
      address: { street: "123 Main St", city: "Anytown" },
    };

    const result = translateSchemaComplete(schemaIO, data);

    expect(result.schema.type).toBe("object");
    expect(result.schema.properties?.person.type).toBe("object");
    expect(result.schema.properties?.address.type).toBe("object");
    expect(result.formData).toEqual(data);
  });

  it("should handle arrays of objects", () => {
    const schemaIO: SchemaType = {
      type: "array",
      view: { component: "ListView" },
      items: {
        type: "object",
        view: { component: "ObjectView" },
        properties: {
          name: {
            type: "string",
            view: { component: "FieldView", label: "Name" },
          },
          value: {
            type: "number",
            view: { component: "FieldView", label: "Value" },
          },
        },
      },
    };

    const data = [
      { name: "Item 1", value: 10 },
      { name: "Item 2", value: 20 },
    ];

    const result = translateSchemaComplete(schemaIO, data);

    expect(result.schema.type).toBe("array");
    expect((result.schema.items as any).type).toBe("object");
    expect(result.formData).toEqual(data);
  });
});

describe("type guards integration", () => {
  it("should correctly identify SchemaIO schemas", () => {
    const schemaIO = {
      type: "string",
      view: { component: "FieldView" },
    };

    expect(isSchemaIOSchema(schemaIO)).toBe(true);
    expect(isJSONSchema(schemaIO)).toBe(false);
  });

  it("should correctly identify JSON schemas", () => {
    const jsonSchema = {
      type: "string",
      title: "My Field",
    };

    expect(isSchemaIOSchema(jsonSchema)).toBe(false);
    expect(isJSONSchema(jsonSchema)).toBe(true);
  });

  it("should handle translation based on schema type", () => {
    const schema: any = {
      type: "string",
      view: { component: "FieldView", label: "Name" },
    };

    if (isSchemaIOSchema(schema)) {
      const result = translateSchemaComplete(schema);
      expect(result.schema.title).toBe("Name");
    } else {
      throw new Error("Should have been identified as SchemaIO");
    }
  });
});
