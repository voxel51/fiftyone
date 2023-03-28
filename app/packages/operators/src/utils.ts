export function toJSONSchema(fields: []) {
  const typeMap = {
    Boolean: "boolean",
    String: "string",
    Number: "number",
    Enum: "string",
    List: "array",
    ObjectType: "object",
  };
  return {
    type: "object",
    required: [], // todo: compute
    properties: fields.reduce((prev, current) => {
      const { label, default: defaultValue, name, type, view } = current;
      const typeId = type.constructor.name;

      let fieldSchema = {
        type: typeMap[typeId],
        title: view?.label || label,
        default: defaultValue,
      };

      if (typeId === "Enum") {
        fieldSchema.enum = type.values;
      }

      if (typeId === "List") {
        const elementTypeId = type.elementType.constructor.name;
        const elementType = typeMap[elementTypeId];
        fieldSchema.items = {
          type: elementType,
        };
      }

      if (typeId === "ObjectType") {
        fieldSchema = toJSONSchema(type.properties);
      }

      return {
        ...prev,
        [name]: fieldSchema,
      };
    }, {}),
  };
}
