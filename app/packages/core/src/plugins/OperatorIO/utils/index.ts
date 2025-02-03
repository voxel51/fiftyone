import { types } from "@fiftyone/operators";
import { DropdownView } from "../../SchemaIO/components";

const inputComponentsByType = {
  Object: "ObjectView",
  Boolean: "CheckboxView",
  String: "FieldView",
  Number: "FieldView",
  List: "ListView",
  OneOf: "OneOfView",
  Tuple: "TupleView",
  Map: "MapView",
  File: "FileExplorerView",
  UploadedFile: "FileView",
};
const outputComponentsByType = {
  Object: "ObjectView",
  Boolean: "LabelValueView",
  String: "LabelValueView",
  Number: "LabelValueView",
  List: "ListView",
  OneOf: "OneOfView",
  Tuple: "TupleView",
  File: "FileExplorerView",
  UploadedFile: "FileView",
};
const baseViews = ["View", "PromptView", "DrawerView"];
const viewAliases = {
  Button: "ButtonView",
  Dropdown: "DropdownView",
  Choices: "DropdownView",
  Error: "AlertView",
  Header: "HeaderView",
  Notice: "AlertView",
  RadioGroup: "RadioView",
  Success: "AlertView",
  Warning: "AlertView",
  IconButtonView: "ButtonView",
  HStackView: "GridView",
  VStackView: "GridView",
  ButtonGroupView: "GridView",
  MenuView: "GridView",
};
const operatorTypeToJSONSchemaType = {
  Object: "object",
  Enum: "string",
  Boolean: "boolean",
  String: "string",
  Number: "number",
  List: "array",
  OneOf: "oneOf",
  Tuple: "array",
  Map: "object",
  File: "object",
  UploadedFile: "object",
};
const unsupportedView = "UnsupportedView";

const primitiveOperatorTypes = ["Boolean", "String", "Number"];

function getTypeName(property) {
  const { type } = property;
  for (const typeName in types) {
    if (type.constructor === types[typeName]) return typeName;
  }
}

function getComponent(property, options) {
  const ViewComponent = getComponentByView(property);
  const TypeComponent = getComponentByType(property, options);
  return ViewComponent || TypeComponent || unsupportedView;
}

function getComponentByType(property, options) {
  const typeName = getTypeName(property);
  const component = inputComponentsByType[typeName];
  if (options?.isOutput) return getOutputComponent(property, options);
  return component;
}

function getOutputComponent(property, options) {
  const typeName = getTypeName(property);
  const component = outputComponentsByType[typeName];
  if (typeName === "List") {
    const elementTypeName = getTypeName({ type: property.type.elementType });
    const isPrimitive = primitiveOperatorTypes.includes(elementTypeName);
    if (isPrimitive) return "TagsView";
  }
  return component;
}

function getComponentByView(property) {
  const view = getViewSchema(property) || {};
  const viewComponentName = view.component || view.name;
  if (viewComponentName && !baseViews.includes(viewComponentName)) {
    return viewAliases[viewComponentName] || viewComponentName;
  }
  if (Array.isArray(view.choices)) {
    return "DropdownView";
  }
}

function getSchema(property, options = {}) {
  const { defaultValue, required } = property;
  const typeName = getTypeName(property);
  const type = operatorTypeToJSONSchemaType[typeName];
  const readOnly =
    typeof options.readOnly === "boolean" ? options.readOnly : options.isOutput;
  const schema = {
    type,
    view: { readOnly, ...getViewSchema(property) },
    default: defaultValue,
    onChange: property.onChange,
    required,
  };
  const component = getComponent(property, options);
  schema.view.component = component;

  const computedOptions = { ...options, readOnly: schema.view.readOnly };

  if (typeName === "Number") {
    const { min, max, float } = property.type;
    schema.min = min;
    schema.max = max;
    schema.multipleOf = float ? 0.01 : 1;
  }

  if (typeName === "Object") {
    schema.properties = getPropertiesSchema(property, computedOptions);
  }

  if (typeName === "List") {
    schema.items = getSchema(
      { type: property.type.elementType },
      computedOptions
    );
    schema.minItems = property.type.minItems;
    schema.maxItems = property.type.maxItems;
    if (schema?.view?.items) {
      schema.view.items.component = getComponent(
        { type: property.type.elementType, view: schema?.view?.items },
        computedOptions
      );
    }
  }

  if (typeName === "OneOf") {
    schema.types = property.type.types.map((type) =>
      getSchema({ type }, computedOptions)
    );
  }

  // todo: use "prefixItems","minItems","maxItems", "items: false" for proper
  //  json schema validation support
  if (typeName === "Tuple") {
    schema.items = property.type.items.map((type) =>
      getSchema({ type }, computedOptions)
    );
  }

  if (typeName === "Map") {
    schema.additionalProperties = getSchema(
      {
        type: property.type.valueType,
        view: property?.view?.value,
      },
      computedOptions
    );
  }

  return schema;
}

function getViewSchema(property) {
  let view = property?.view || {};
  const typeName = getTypeName(property);
  if (typeName === "Enum") {
    let choices = view.choices || [];
    if (choices.length === 0) {
      const enumValues = property?.type?.values || [];
      choices = enumValues.map((value) => ({ value, label: value }));
    }
    view = { ...view, choices };
  }
  view = { ...(view?.options || {}), ...view };
  if (
    typeof view.read_only === "boolean" &&
    typeof view.readOnly !== "boolean"
  ) {
    view.readOnly = view.read_only;
  }
  return view;
}

function getPropertiesSchema(property, options?) {
  const { properties } = property?.type;
  if (properties instanceof Map) {
    const propertiesObject = {};
    properties.forEach((value, key) => {
      propertiesObject[key] = getSchema(value, options);
    });
    return propertiesObject;
  }
  return {};
}

export function operatorToIOSchema(operatorSchema, options?) {
  return getSchema(operatorSchema, options);
}

export function getErrorsByPath(errors: []) {
  if (!Array.isArray(errors)) return {};
  return errors.reduce((pathErrors, error) => {
    const { path } = error;
    if (!pathErrors[path]) pathErrors[path] = [];
    pathErrors[path].push(error);
    return pathErrors;
  }, {});
}

export function log(...args) {
  console.groupCollapsed(">>>", ...args);
  console.trace();
  console.groupEnd();
}
