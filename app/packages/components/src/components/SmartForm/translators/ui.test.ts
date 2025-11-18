import { describe, it, expect } from "vitest";
import { translateToUISchema } from "./ui";
import type { TranslationContext } from "./utils";

describe("translateToUISchema", () => {
  const baseContext: TranslationContext = {
    warnings: [],
    path: [],
    strictMode: false,
  };

  describe("no view", () => {
    it("should return empty uiSchema when no view present", () => {
      const schemaIO = { type: "string" };
      const result = translateToUISchema(schemaIO, baseContext);

      expect(result).toEqual({});
    });
  });

  describe("FieldView", () => {
    it("should add placeholder", () => {
      const schemaIO = {
        type: "string",
        view: { component: "FieldView", placeholder: "Enter text" },
      };
      const result = translateToUISchema(schemaIO, baseContext);

      expect(result["ui:placeholder"]).toBe("Enter text");
    });

    it("should set readonly", () => {
      const schemaIO = {
        type: "string",
        view: { component: "FieldView", read_only: true },
      };
      const result = translateToUISchema(schemaIO, baseContext);

      expect(result["ui:readonly"]).toBe(true);
    });

    it("should handle readOnly variant", () => {
      const schemaIO = {
        type: "string",
        view: { component: "FieldView", readOnly: true },
      };
      const result = translateToUISchema(schemaIO, baseContext);

      expect(result["ui:readonly"]).toBe(true);
    });
  });

  describe("CheckboxView", () => {
    it("should set checkbox widget", () => {
      const schemaIO = {
        type: "boolean",
        view: { component: "CheckboxView" },
      };
      const result = translateToUISchema(schemaIO, baseContext);

      expect(result["ui:widget"]).toBe("checkbox");
    });
  });

  describe("DropdownView", () => {
    it("should set Dropdown widget", () => {
      const schemaIO = {
        type: "string",
        view: { component: "DropdownView" },
      };
      const result = translateToUISchema(schemaIO, baseContext);

      expect(result["ui:widget"]).toBe("Dropdown");
    });

    it("should map dropdown options", () => {
      const schemaIO = {
        type: "string",
        view: {
          component: "DropdownView",
          multiple: true,
          compact: true,
          color: "primary",
          variant: "outlined",
        },
      };
      const result = translateToUISchema(schemaIO, baseContext);

      expect(result["ui:options"]).toEqual({
        multiple: true,
        compact: true,
        color: "primary",
        variant: "outlined",
      });
    });

    it("should handle Dropdown shorthand", () => {
      const schemaIO = {
        type: "string",
        view: { component: "Dropdown" },
      };
      const result = translateToUISchema(schemaIO, baseContext);

      expect(result["ui:widget"]).toBe("Dropdown");
    });
  });

  describe("RadioView", () => {
    it("should set radio widget", () => {
      const schemaIO = {
        type: "string",
        view: { component: "RadioView" },
      };
      const result = translateToUISchema(schemaIO, baseContext);

      expect(result["ui:widget"]).toBe("radio");
    });

    it("should handle RadioGroup shorthand", () => {
      const schemaIO = {
        type: "string",
        view: { component: "RadioGroup" },
      };
      const result = translateToUISchema(schemaIO, baseContext);

      expect(result["ui:widget"]).toBe("radio");
    });
  });

  describe("AutocompleteView", () => {
    it("should set AutoComplete widget", () => {
      const schemaIO = {
        type: "string",
        view: { component: "AutocompleteView" },
      };
      const result = translateToUISchema(schemaIO, baseContext);

      expect(result["ui:widget"]).toBe("AutoComplete");
    });

    it("should map autocomplete options with defaults", () => {
      const schemaIO = {
        type: "string",
        view: { component: "AutocompleteView" },
      };
      const result = translateToUISchema(schemaIO, baseContext);

      expect(result["ui:options"]).toEqual({
        freeSolo: true,
        allowClear: true,
        allowDuplicates: true,
      });
    });

    it("should map autocomplete options with custom values", () => {
      const schemaIO = {
        type: "string",
        view: {
          component: "AutocompleteView",
          allow_user_input: false,
          allow_clearing: false,
          allow_duplicates: false,
        },
      };
      const result = translateToUISchema(schemaIO, baseContext);

      expect(result["ui:options"]).toEqual({
        freeSolo: false,
        allowClear: false,
        allowDuplicates: false,
      });
    });
  });

  describe("ColorView", () => {
    it("should set color widget", () => {
      const schemaIO = {
        type: "string",
        view: { component: "ColorView" },
      };
      const result = translateToUISchema(schemaIO, baseContext);

      expect(result["ui:widget"]).toBe("color");
    });
  });

  describe("CodeView and JSONView", () => {
    it("should map CodeView to textarea", () => {
      const context = { ...baseContext, warnings: [] };
      const schemaIO = {
        type: "string",
        view: { component: "CodeView" },
      };
      const result = translateToUISchema(schemaIO, context);

      expect(result["ui:widget"]).toBe("textarea");
      expect(result["ui:options"]).toEqual({ rows: 10 });
      expect(context.warnings).toHaveLength(1);
    });

    it("should map JSONView to textarea", () => {
      const context = { ...baseContext, warnings: [] };
      const schemaIO = {
        type: "string",
        view: { component: "JSONView" },
      };
      const result = translateToUISchema(schemaIO, context);

      expect(result["ui:widget"]).toBe("textarea");
      expect(result["ui:options"]).toEqual({ rows: 10 });
      expect(context.warnings).toHaveLength(1);
    });
  });

  describe("FileView", () => {
    it("should set file widget and add warning", () => {
      const context = { ...baseContext, warnings: [] };
      const schemaIO = {
        type: "string",
        view: { component: "FileView" },
      };
      const result = translateToUISchema(schemaIO, context);

      expect(result["ui:widget"]).toBe("file");
      expect(context.warnings).toHaveLength(1);
    });
  });

  describe("TabsView", () => {
    it("should map to radio with inline option", () => {
      const context = { ...baseContext, warnings: [] };
      const schemaIO = {
        type: "string",
        view: { component: "TabsView", variant: "standard" },
      };
      const result = translateToUISchema(schemaIO, context);

      expect(result["ui:widget"]).toBe("radio");
      expect(result["ui:options"]).toEqual({ inline: true });
      expect(context.warnings).toHaveLength(1);
    });
  });

  describe("ObjectView", () => {
    it("should recursively process object properties", () => {
      const schemaIO = {
        type: "object",
        view: { component: "ObjectView" },
        properties: {
          field1: {
            type: "string",
            view: { component: "FieldView", placeholder: "Field 1" },
          },
          field2: {
            type: "boolean",
            view: { component: "CheckboxView" },
          },
        },
      };
      const result = translateToUISchema(schemaIO, baseContext);

      expect(result.field1).toHaveProperty("ui:placeholder", "Field 1");
      expect(result.field2).toHaveProperty("ui:widget", "checkbox");
    });
  });

  describe("ListView", () => {
    it("should process array items", () => {
      const schemaIO = {
        type: "array",
        view: { component: "ListView" },
        items: {
          type: "string",
          view: { component: "FieldView", placeholder: "Item" },
        },
      };
      const result = translateToUISchema(schemaIO, baseContext);

      expect(result.items).toHaveProperty("ui:placeholder", "Item");
    });
  });

  describe("TupleView", () => {
    it("should process tuple items", () => {
      const schemaIO = {
        type: "array",
        view: { component: "TupleView" },
        items: [
          {
            type: "string",
            view: { component: "FieldView", placeholder: "First" },
          },
          {
            type: "number",
            view: { component: "FieldView", placeholder: "Second" },
          },
        ],
      };
      const result = translateToUISchema(schemaIO, baseContext);

      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toHaveProperty("ui:placeholder", "First");
      expect(result.items[1]).toHaveProperty("ui:placeholder", "Second");
    });
  });

  describe("MapView", () => {
    it("should set map options and add warning", () => {
      const context = { ...baseContext, warnings: [] };
      const schemaIO = {
        type: "object",
        view: { component: "MapView" },
      };
      const result = translateToUISchema(schemaIO, context);

      expect(result["ui:options"]).toEqual({
        addable: true,
        orderable: false,
        removable: true,
      });
      expect(context.warnings).toHaveLength(1);
    });
  });

  describe("OneOfView", () => {
    it("should set discriminator option", () => {
      const schemaIO = {
        type: "oneOf",
        view: { component: "OneOfView" },
        types: [{ type: "string" }, { type: "number" }],
      };
      const result = translateToUISchema(schemaIO, baseContext);

      expect(result["ui:options"]).toEqual({
        discriminator: true,
      });
    });
  });

  describe("custom components", () => {
    const customComponents = [
      "ProgressView",
      "LinkView",
      "DashboardView",
      "FileExplorerView",
      "LazyFieldView",
      "MenuView",
      "ButtonView",
      "NoticeView",
      "MarkdownView",
      "PlotlyView",
    ];

    customComponents.forEach((component) => {
      it(`should add warning for ${component}`, () => {
        const context = { ...baseContext, warnings: [] };
        const schemaIO = {
          type: "string",
          view: { component },
        };
        translateToUISchema(schemaIO, context);

        expect(context.warnings).toHaveLength(1);
        expect(context.warnings[0]).toContain(component);
      });
    });
  });

  describe("common view properties", () => {
    it("should add help text from caption", () => {
      const schemaIO = {
        type: "string",
        view: { component: "FieldView", caption: "Help text" },
      };
      const result = translateToUISchema(schemaIO, baseContext);

      expect(result["ui:help"]).toBe("Help text");
    });

    it("should add help text from description if no caption", () => {
      const schemaIO = {
        type: "string",
        view: { component: "FieldView", description: "Description text" },
      };
      const result = translateToUISchema(schemaIO, baseContext);

      expect(result["ui:help"]).toBe("Description text");
    });

    it("should prefer caption over description for help text", () => {
      const schemaIO = {
        type: "string",
        view: {
          component: "FieldView",
          caption: "Caption",
          description: "Description",
        },
      };
      const result = translateToUISchema(schemaIO, baseContext);

      expect(result["ui:help"]).toBe("Caption");
    });

    it("should hide submit button", () => {
      const schemaIO = {
        type: "string",
        view: { component: "FieldView" },
      };
      const result = translateToUISchema(schemaIO, baseContext);

      expect(result["ui:submitButtonOptions"]).toEqual({
        norender: true,
      });
    });
  });

  describe("view.name fallback", () => {
    it("should use view.name if component not present", () => {
      const schemaIO = {
        type: "boolean",
        view: { name: "CheckboxView" },
      };
      const result = translateToUISchema(schemaIO, baseContext);

      expect(result["ui:widget"]).toBe("checkbox");
    });
  });
});
