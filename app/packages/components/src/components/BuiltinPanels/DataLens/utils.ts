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
