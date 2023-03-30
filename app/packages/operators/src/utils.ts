const typeMap = {
  Boolean: "boolean",
  String: "string",
  Number: "number",
  Enum: "string",
  List: "array",
  ObjectType: "object",
};

export function toJSONSchema(schema) {
  const { label, default: defaultValue, name, type, view } = schema;
  const typeId = type.constructor.name;
  let jsonSchema = {
    type: typeMap[typeId],
    title: view?.label || label,
    default: defaultValue,
  };

  if (typeId === "Enum") {
    jsonSchema.enum = type.values;
  }

  if (typeId === "List") {
    jsonSchema.items = toJSONSchema({ type: type.elementType });
  }

  if (typeId === "ObjectType") {
    jsonSchema.properties = type.properties.reduce((prev, current) => {
      prev[current.name] = toJSONSchema(current);
      return prev;
    }, {});
  }

  return jsonSchema;
}

export function fieldsToJSONSchema(fields: []) {
  return {
    type: "object",
    required: [],
    properties: fields.reduce((fieldsObject, field) => {
      fieldsObject[field.name] = toJSONSchema(field);
      return fieldsObject;
    }, {}),
  };
}
