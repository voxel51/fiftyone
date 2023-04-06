const componentsByType = {
  ObjectType: "ObjectView",
  Boolean: "CheckboxView",
  String: "FieldView",
  Number: "FieldView",
  List: "ListView",
  OneOf: "OneOfView",
};
const componentByView = {
  RadioGroup: "RadioView",
  Dropdown: "DropdownView",
};

const typeMap = {
  ObjectType: "object",
  Enum: "string",
  Boolean: "boolean",
  String: "string",
  Number: "number",
  List: "array",
  OneOf: "oneOf",
};

const unsupportedView = "UnsupportedView";

function getTypeName(property) {
  const { type } = property;
  return type.constructor.name;
}

function getComponent(property) {
  const typeName = getTypeName(property);
  const ViewComponent = getComponentByView(property);
  return ViewComponent || componentsByType[typeName] || unsupportedView;
}

function getComponentByView(property) {
  const view = getViewSchema(property) || {};
  const SpecifiedComponent = componentByView[view.name];
  if (SpecifiedComponent) return SpecifiedComponent;
  if (Array.isArray(view.choices)) return "DropdownView";
}

function getSchema(property) {
  const { defaultValue, required } = property;
  const typeName = getTypeName(property);
  const type = typeMap[typeName];
  const schema = {
    type,
    view: getViewSchema(property),
    default: defaultValue,
    required,
  };
  const component = getComponent(property);
  schema.view.component = component;

  if (typeName === "ObjectType") {
    schema.properties = getPropertiesSchema(property);
  }

  if (typeName === "List") {
    schema.items = getSchema({ type: property.type.elementType });
  }

  if (typeName === "OneOf") {
    schema.types = property.type.types.map((type) => getSchema({ type }));
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

function getPropertiesSchema(property) {
  const { properties } = property?.type;
  if (properties instanceof Map) {
    const propertiesObject = {};
    properties.forEach((value, key) => {
      propertiesObject[key] = getSchema(value);
    });
    return propertiesObject;
  }
  return {};
}

export function operatorToIOSchema(operatorSchema) {
  return getSchema(operatorSchema);
}
