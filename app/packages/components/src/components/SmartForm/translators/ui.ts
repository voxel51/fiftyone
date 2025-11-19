import type { UiSchema } from "@rjsf/utils";
import { addWarning, type TranslationContext } from "./utils";

/**
 * Translates SchemaIO view to UI Schema
 *
 * Note: Uses `any` for schemaIO parameter due to recursive processing of
 * dynamic schema structures with varying shapes.
 */
export function translateToUISchema(
  schemaIO: any,
  context: TranslationContext
): UiSchema {
  const uiSchema: UiSchema = {};
  const view = schemaIO.view;

  if (!view) return uiSchema;

  const component = view.component || view.name;

  switch (component) {
    case "FieldView":
      if (view.placeholder) {
        uiSchema["ui:placeholder"] = view.placeholder;
      }

      if (view.read_only || view.readOnly) {
        uiSchema["ui:readonly"] = true;
      }

      break;

    case "CheckboxView":
      uiSchema["ui:widget"] = "checkbox";
      break;

    case "DropdownView":
    case "Dropdown":
      uiSchema["ui:widget"] = "Dropdown";
      uiSchema["ui:options"] = {
        multiple: view.multiple,
        compact: view.compact,
        color: view.color,
        variant: view.variant,
      };
      break;

    case "RadioView":
    case "RadioGroup":
      uiSchema["ui:widget"] = "radio";
      break;

    case "AutocompleteView":
      uiSchema["ui:widget"] = "AutoComplete";
      uiSchema["ui:options"] = {
        freeSolo: view.allow_user_input ?? true,
        allowClear: view.allow_clearing ?? true,
        allowDuplicates: view.allow_duplicates ?? true,
      };
      break;

    case "ColorView":
      uiSchema["ui:widget"] = "color";
      break;

    case "CodeView":
    case "JSONView":
      uiSchema["ui:widget"] = "textarea";
      uiSchema["ui:options"] = {
        rows: 10,
      };
      addWarning(
        context,
        `${component} mapped to textarea at: ${context.path.join(
          "."
        )}. Consider custom widget for syntax highlighting.`
      );
      break;

    case "FileView":
      uiSchema["ui:widget"] = "file";
      addWarning(
        context,
        `FileView may require custom widget configuration at: ${context.path.join(
          "."
        )}`
      );
      break;

    case "TabsView":
      uiSchema["ui:widget"] = "radio";
      if (view.variant) {
        uiSchema["ui:options"] = { inline: true };
      }
      addWarning(
        context,
        `TabsView mapped to radio buttons at: ${context.path.join(".")}`
      );
      break;

    case "ObjectView":
      // Handle object properties recursively
      if (schemaIO.properties) {
        for (const [key, value] of Object.entries(schemaIO.properties)) {
          const propContext = {
            ...context,
            path: [...context.path, key],
          };
          uiSchema[key] = translateToUISchema(value, propContext);
        }
      }
      break;

    case "ListView":
      if (schemaIO.items && !Array.isArray(schemaIO.items)) {
        uiSchema.items = translateToUISchema(schemaIO.items, {
          ...context,
          path: [...context.path, "items"],
        });
      }
      break;

    case "TupleView":
      if (schemaIO.items && Array.isArray(schemaIO.items)) {
        uiSchema.items = schemaIO.items.map((item: any, index: number) =>
          translateToUISchema(item, {
            ...context,
            path: [...context.path, `items[${index}]`],
          })
        );
      }
      break;

    case "MapView":
      uiSchema["ui:options"] = {
        addable: true,
        orderable: false,
        removable: true,
      };
      addWarning(
        context,
        `MapView requires custom implementation at: ${context.path.join(".")}`
      );
      break;

    case "OneOfView":
      if (schemaIO.types) {
        uiSchema["ui:options"] = {
          discriminator: true,
        };
      }
      break;

    case "ProgressView":
    case "LinkView":
    case "DashboardView":
    case "FileExplorerView":
    case "LazyFieldView":
    case "MenuView":
    case "ButtonView":
    case "NoticeView":
    case "MarkdownView":
    case "PlotlyView":
      // These are custom SchemaIO components without direct RJSF equivalents
      addWarning(
        context,
        `Custom component "${component}" requires custom widget implementation at: ${context.path.join(
          "."
        )}`
      );
      break;
  }

  if (view.read_only || view.readOnly) {
    uiSchema["ui:readonly"] = true;
  }

  if (view.placeholder) {
    uiSchema["ui:placeholder"] = view.placeholder;
  }

  if (view.caption) {
    uiSchema["ui:help"] = view.caption;
  } else if (view.description && !uiSchema["ui:help"]) {
    uiSchema["ui:help"] = view.description;
  }

  // Hide submit button by default
  uiSchema["ui:submitButtonOptions"] = {
    norender: true,
  };

  return uiSchema;
}
