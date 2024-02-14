export interface Field {
  ftype: string;
  dbField: string | null;
  description: string | null;
  info: object | null;
  name: string;
  embeddedDocType: string | null;
  subfield: string | null;
  path: string;
  fields?: Schema;
}

export interface StrictField extends Omit<Field, "fields"> {
  fields?: StrictField[];
}

export interface Schema {
  [key: string]: Field;
}

export const getFieldInfo = (() => {
  const cache = {};

  return (path: string, schema: Schema): Field | undefined => {
    if (!cache[path]) {
      const keys = path.split(".");
      let field: Field;
      for (let index = 0; index < keys.length; index++) {
        if (!schema) return null;

        field = schema[keys[index]];
        schema = field?.fields;
      }

      cache[path] = field;
    }

    return cache[path];
  };
})();

export const getCls = (() => {
  const cache = {};

  return (path: string, schema: Schema): string => {
    const field = getFieldInfo(path, schema);

    if (!field?.embeddedDocType) {
      return null;
    }

    if (!cache[field.embeddedDocType]) {
      cache[field.embeddedDocType] = field.embeddedDocType
        .split(".")
        .slice(-1)[0];
    }

    return cache[field?.embeddedDocType];
  };
})();
