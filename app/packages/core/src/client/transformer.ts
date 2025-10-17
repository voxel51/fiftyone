import * as _ from "lodash";
import { isObject } from "./util";

/**
 * DataTransformer implementations offer conversion from one record type to another.
 */
export type DataTransformer = {
  transform: (data: Record<string, unknown>) => Record<string, unknown>;
};

/**
 * FieldTransformer implementations offer conversion for a specific field type.
 */
export type FieldTransformer = {
  canTransform: (data: unknown) => boolean;
  transform: (data: unknown) => unknown;
};

/**
 * Convert serialized python datetime.datetime data to a format consistent with
 * graphql.
 */
const DateTimeTransformer: FieldTransformer = {
  canTransform: (data: unknown): boolean => {
    return isObject(data) && "$date" in (data as object);
  },
  transform: (data: unknown): { _cls: "DateTime"; datetime: number } => {
    const date = new Date((data as { $date: string }).$date);
    return { _cls: "DateTime", datetime: date.getTime() };
  },
};

/**
 * Convert serialized bson.ObjectId data to a format consistent with graphql.
 */
const ObjectIdTransformer: FieldTransformer = {
  canTransform: (data: unknown): boolean => {
    return isObject(data) && "$oid" in (data as object);
  },
  transform: (data: unknown): string => {
    return (data as { $oid: string }).$oid;
  },
};

const fieldTransformers = [DateTimeTransformer, ObjectIdTransformer];

/**
 * Transformer which converts `fo.Sample.to_dict()` serialization to a format
 * consistent with graphql.
 */
const SampleTransformer: DataTransformer = {
  transform: (data: Record<string, unknown>): Record<string, unknown> => {
    // recursive helper function
    const transformInner = (innerData: unknown): unknown => {
      // try to use a registered transformer
      for (const transformer of fieldTransformers) {
        if (transformer.canTransform(innerData)) {
          return transformer.transform(innerData);
        }
      }

      // otherwise recursively transform
      if (Array.isArray(innerData)) {
        return innerData.map((e) => transformInner(e));
      } else if (isObject(innerData)) {
        for (const key of Object.keys(innerData)) {
          innerData[key] = transformInner(innerData[key]);
        }
      }

      return innerData;
    };

    const result = _.cloneDeep(data);
    transformInner(result);
    return result;
  },
};

/**
 * Transform sample data returned by `fo.Sample.to_dict()` to a format
 * compatible with graphql query results.
 *
 * @param sample Serialized sample data
 */
export const transformSampleData = (
  sample: Record<string, unknown>
): Record<string, unknown> => {
  return SampleTransformer.transform(sample);
};
