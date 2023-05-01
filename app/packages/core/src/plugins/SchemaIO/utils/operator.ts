const componentsByType = {
  ObjectType: "ObjectView",
  Boolean: "CheckboxView",
  String: "FieldView",
  Number: "FieldView",
  List: "ListView",
  OneOf: "OneOfView",
  Tuple: "TupleView",
  MapType: "MapView",
};
const componentByView = {
  Button: "ButtonView",
  Dropdown: "DropdownView",
  Error: "AlertView",
  Header: "HeaderView",
  Notice: "AlertView",
  RadioGroup: "RadioView",
  Success: "AlertView",
  Warning: "AlertView",
  AlertView: "AlertView",
  AutocompleteView: "AutocompleteView",
  ButtonView: "ButtonView",
  CheckboxView: "CheckboxView",
  CodeView: "CodeView",
  ColorView: "ColorView",
  DropdownView: "DropdownView",
  FieldView: "FieldView",
  FileView: "FileView",
  HeaderView: "HeaderView",
  HiddenView: "HiddenView",
  ImageView: "ImageView",
  InferredView: "InferredView",
  JSONView: "JSONView",
  KeyValueView: "KeyValueView",
  LabelValueView: "LabelValueView",
  LinkView: "LinkView",
  ListView: "ListView",
  LoadingView: "LoadingView",
  MapView: "MapView",
  ObjectView: "ObjectView",
  OneOfView: "OneOfView",
  PlotlyView: "PlotlyView",
  PrimitiveView: "PrimitiveView",
  RadioView: "RadioView",
  SliderView: "SliderView",
  SwitchView: "SwitchView",
  TableView: "TableView",
  TabsView: "TabsView",
  TagsView: "TagsView",
  TextFieldView: "TextFieldView",
  TuplesView: "TuplesView",
  UnsupportedView: "UnsupportedView",
};
const typeMap = {
  ObjectType: "object",
  Enum: "string",
  Boolean: "boolean",
  String: "string",
  Number: "number",
  List: "array",
  OneOf: "oneOf",
  Tuple: "array",
  MapType: "object",
};
const unsupportedView = "UnsupportedView";

const outputComponentByType = {
  ObjectType: "ObjectView",
  Boolean: "LabelValueView",
  String: "LabelValueView",
  Number: "LabelValueView",
  List: "ListView",
  OneOf: "OneOfView",
  Tuple: "TupleView",
};

const primitiveOperatorTypes = ["Boolean", "String", "Number"];

function getTypeName(property) {
  const { type } = property;
  return type.constructor.name;
}

function getComponent(property, options) {
  const ViewComponent = getComponentByView(property);
  const TypeComponent = getComponentByType(property, options);
  return ViewComponent || TypeComponent || unsupportedView;
}

function getComponentByType(property, options) {
  const typeName = getTypeName(property);
  const component = componentsByType[typeName];
  if (options?.isOutput) return getOutputComponent(property, options);
  return component;
}

function getOutputComponent(property, options) {
  const typeName = getTypeName(property);
  const component = outputComponentByType[typeName];
  if (typeName === "List") {
    const elementTypeName = getTypeName({ type: property.type.elementType });
    const isPrimitive = primitiveOperatorTypes.includes(elementTypeName);
    if (isPrimitive) return "TagsView";
  }
  return component;
}

function getComponentByView(property) {
  const view = getViewSchema(property) || {};
  const SpecifiedComponent = componentByView[view.name];
  if (SpecifiedComponent) return SpecifiedComponent;
  if (Array.isArray(view.choices)) return "DropdownView";
}

function getSchema(property, options?) {
  const { defaultValue, required } = property;
  const typeName = getTypeName(property);
  const type = typeMap[typeName];
  const schema = {
    type,
    view: { readOnly: options?.isOutput, ...getViewSchema(property) },
    default: defaultValue,
    required,
  };
  const component = getComponent(property, options);
  schema.view.component = component;

  if (typeName === "ObjectType") {
    schema.properties = getPropertiesSchema(property, options);
  }

  if (typeName === "List") {
    schema.items = getSchema({ type: property.type.elementType }, options);
  }

  if (typeName === "OneOf") {
    schema.types = property.type.types.map((type) =>
      getSchema({ type }, options)
    );
  }

  // todo: use "prefixItems","minItems","maxItems", "items: false" for proper
  //  json schema validation support
  if (typeName === "Tuple") {
    schema.items = property.type.items.map((type) =>
      getSchema({ type }, options)
    );
  }

  if (typeName === "MapType") {
    schema.additionalProperties = getSchema({
      type: property.type.valueType,
      view: property?.view?.value,
    });
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
