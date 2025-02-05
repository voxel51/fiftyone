const findFieldsHelper = (
  fields: string[],
  data: any,
  prefix?: string,
  output?: { [k: string]: any }
): { [k: string]: any } => {
  output = output ?? {};

  if (data) {
    for (const attr of Object.keys(data)) {
      if (fields.includes(attr)) {
        const key = prefix ? `${prefix}.${attr}` : attr;
        output[key] = data[attr];
      }

      // Recurse for any nested objects
      if (typeof data[attr] === "object") {
        findFieldsHelper(
          fields,
          data[attr],
          prefix ? `${prefix}.${attr}` : attr,
          output
        );
      }
    }
  }

  return output;
};

/**
 * Find all fields matching the provided names in a nested object.
 *
 * This method returns an object whose keys represent a dot-delimited JSON path
 * to the nested field, and whose values are copied from the source object.
 *
 * @example
 * ```ts
 * const data = {
 *   a: 1,
 *   b: {
 *     a: 2,
 *     z: 5,
 *   },
 *   c: 3
 * };
 *
 * const fields = findFields(["a"], data);
 *
 * // fields === {a: 1, "b.a": 2}
 * ```
 *
 * @param fields List of fields to find
 * @param data Object to search
 */
export const findFields = (
  fields: string[],
  data: any
): { [k: string]: any } => {
  return findFieldsHelper(fields, data);
};

/**
 * Helper method for converting from snake_case to camelCase
 * @param str string to convert
 */
export const toCamelCase = (str?: string): string | undefined => {
  const s = str
    ?.match(
      /[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g
    )
    ?.map((x: string) => x.slice(0, 1).toUpperCase() + x.slice(1).toLowerCase())
    .join("");

  return s && s.slice(0, 1).toLowerCase() + s.slice(1);
};

/**
 * Helper method to convert the sample schema from SDK to looker.
 *
 * The schema returned by the SDK needs to be massaged for the looker
 * to render properly.
 *
 * This method achieves the following:
 *   1. Convert keys from snake_case to camelCase
 *   2. Convert the 'fields' property from an array to a nested object
 *   3. Ensure 'path' is available as a top-level property
 *   4. Do (1) - (3) recursively for nested objects
 * @param schema
 */
export const formatSchema = (schema: { [k: string]: any }) => {
  const formatted: { [k: string]: any } = {};

  // Convert top-level keys to camelCase
  for (const k of Object.keys(schema)) {
    formatted[toCamelCase(k)!] = schema[k];
  }

  // Ensure 'path' is defined
  formatted["path"] = schema["name"];

  // 'fields' is formatted as an array, but looker expects this
  //   to be a nested object instead.
  if (formatted["fields"] instanceof Array) {
    const remapped: { [k: string]: any } = {};
    for (const subfield of formatted["fields"]) {
      // Recurse for each nested object
      remapped[subfield["name"]] = formatSchema(subfield);
    }
    formatted["fields"] = remapped;
  }

  return formatted;
};
