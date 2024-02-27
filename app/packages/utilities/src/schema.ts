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

/**
 * Get the field of an embedded document field path
 *
 * @param path
 * @param schema
 * @returns a field or undefined
 */
export const getFieldInfo = (
  path: string,
  schema: Schema
): Field | undefined => {
  const keys = path.split(".");
  let field: Field;
  for (let index = 0; index < keys.length; index++) {
    if (!schema) return null;

    field = schema[keys[index]];
    schema = field?.fields;
  }

  return field;
};

/**
 * Get the document type cls of an embedded document field path
 *
 * @param path
 * @param schema
 * @returns a cls string or undefined
 */
export const getCls = (path: string, schema: Schema): string => {
  const field = getFieldInfo(path, schema);

  if (!field?.embeddedDocType) {
    return undefined;
  }

  return field.embeddedDocType.split(".").slice(-1)[0];
};
