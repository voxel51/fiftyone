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
  pathWithDbField?: string | null;
}

export interface StrictField extends Omit<Field, "fields"> {
  fields?: StrictField[];
}

export interface Schema {
  [key: string]: Field;
}

export function getFieldInfo(
  fieldPath: string,
  schema: Schema
): Field | undefined {
  const keys = fieldPath.split(".");
  let field: Field;

  const dbFields = [];

  for (let index = 0; index < keys.length; index++) {
    if (!schema || !schema[keys[index]]) return undefined;

    field = { ...schema[keys[index]] };
    schema = field?.fields;

    dbFields.push(field?.dbField);
  }

  field.pathWithDbField = dbFields.filter(Boolean).join(".");

  return field;
}

export function getCls(fieldPath: string, schema: Schema): string | undefined {
  const field = getFieldInfo(fieldPath, schema);

  if (!field?.embeddedDocType) {
    return undefined;
  }

  return field.embeddedDocType.split(".").slice(-1)[0];
}

export function getFieldsWithEmbeddedDocType(
  schema: Schema,
  embeddedDocType: string
): Field[] {
  const result: Field[] = [];

  function recurse(schema: Schema) {
    for (const field of Object.values(schema ?? {})) {
      if (field.embeddedDocType === embeddedDocType) {
        result.push(field);
      }
      if (field.fields) {
        recurse(field.fields);
      }
    }
  }

  recurse(schema);
  return result;
}

export function doesSchemaContainEmbeddedDocType(
  schema: Schema,
  embeddedDocType: string
): boolean {
  function recurse(schema: Schema): boolean {
    return Object.values(schema ?? {}).some((field) => {
      if (field.embeddedDocType === embeddedDocType) {
        return true;
      }
      if (field.fields) {
        return recurse(field.fields);
      }
      return false;
    });
  }

  return recurse(schema);
}
