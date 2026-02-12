import type { UiSchema } from "@rjsf/utils";
import { SmartFormComponents } from "../../types";
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
    case SmartFormComponents.FieldView:
      // handled by post-processing below
      // i.e. uiSchema["ui:readonly"] = true;
      // i.e. uiSchema["ui:placeholder"] = view.placeholder;
      break;

    case SmartFormComponents.LabelValueView:
      // Read-only text display, no input
      uiSchema["ui:widget"] = "LabelValueWidget";
      break;

    case SmartFormComponents.CheckboxView:
      uiSchema["ui:widget"] = "checkbox";
      break;

    case SmartFormComponents.ToggleView:
      uiSchema["ui:widget"] = "BooleanWidget";
      break;

    case SmartFormComponents.DropdownView:
    case SmartFormComponents.Dropdown:
      uiSchema["ui:widget"] = "Dropdown";
      uiSchema["ui:options"] = {
        multiple: view.multiple,
        compact: view.compact,
        color: view.color,
        variant: view.variant,
      };
      break;

    case SmartFormComponents.Select:
    case SmartFormComponents.SelectWidget:
      uiSchema["ui:widget"] = "SelectWidget";
      uiSchema["ui:options"] = {
        multiple: view.multiple,
      };
      break;

    case SmartFormComponents.RadioView:
    case SmartFormComponents.RadioGroup:
      uiSchema["ui:widget"] = "radio";
      break;

    case SmartFormComponents.AutocompleteView:
      uiSchema["ui:widget"] = "AutoComplete";
      uiSchema["ui:options"] = {
        freeSolo: view.allow_user_input ?? true,
        allowClear: view.allow_clearing ?? true,
        allowDuplicates: view.allow_duplicates ?? false, // AutocompleteView creates a Material UI error if true
      };
      break;

    case SmartFormComponents.SliderView:
      uiSchema["ui:widget"] = "RangeWidget";
      uiSchema["ui:options"] = {
        bare: view.bare,
        labeled: view.labeled,
        minLabel: view.minLabel,
        maxLabel: view.maxLabel,
      };
      break;

    case SmartFormComponents.ColorView:
      uiSchema["ui:widget"] = "color";
      break;

    case SmartFormComponents.CodeView:
    case SmartFormComponents.JSONView:
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

    case SmartFormComponents.FileView:
      uiSchema["ui:widget"] = "file";
      addWarning(
        context,
        `FileView may require custom widget configuration at: ${context.path.join(
          "."
        )}`
      );
      break;

    case SmartFormComponents.TabsView:
      uiSchema["ui:widget"] = "radio";
      if (view.variant) {
        uiSchema["ui:options"] = { inline: true };
      }
      addWarning(
        context,
        `TabsView mapped to radio buttons at: ${context.path.join(".")}`
      );
      break;

    case SmartFormComponents.ObjectView:
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

    case SmartFormComponents.GridView:
      // GridView is a layout container - hide title and apply layout options
      uiSchema["ui:options"] = {
        ...uiSchema["ui:options"],
        hideTitle: true, // GridView is just a layout container
        gap: view.gap,
        align_x: view.align_x,
        align_y: view.align_y,
      };

      if (view.orientation === "horizontal") {
        uiSchema["ui:options"].layout = "horizontal";
      }

      // Handle nested properties
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

    case SmartFormComponents.ListView:
      if (schemaIO.items && !Array.isArray(schemaIO.items)) {
        uiSchema.items = translateToUISchema(schemaIO.items, {
          ...context,
          path: [...context.path, "items"],
        });
      }
      break;

    case SmartFormComponents.TupleView:
      if (schemaIO.items && Array.isArray(schemaIO.items)) {
        uiSchema.items = schemaIO.items.map((item: any, index: number) =>
          translateToUISchema(item, {
            ...context,
            path: [...context.path, `items[${index}]`],
          })
        );
      }
      break;

    case SmartFormComponents.MapView:
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

    case SmartFormComponents.OneOfView:
      if (schemaIO.types) {
        uiSchema["ui:options"] = {
          discriminator: true,
        };
      }
      break;

    case SmartFormComponents.ProgressView:
    case SmartFormComponents.LinkView:
    case SmartFormComponents.DashboardView:
    case SmartFormComponents.FileExplorerView:
    case SmartFormComponents.LazyFieldView:
    case SmartFormComponents.MenuView:
    case SmartFormComponents.ButtonView:
    case SmartFormComponents.NoticeView:
    case SmartFormComponents.MarkdownView:
    case SmartFormComponents.PlotlyView:
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
