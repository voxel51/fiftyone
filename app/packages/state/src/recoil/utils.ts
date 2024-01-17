import { Sample } from "@fiftyone/looker";
import {
  EMBEDDED_DOCUMENT_FIELD,
  LABELS,
  LIST_FIELD,
  StrictField,
  UNSUPPORTED_FILTER_TYPES,
  VALID_PRIMITIVE_TYPES,
  getFetchParameters,
} from "@fiftyone/utilities";
import { RecoilValue, useRecoilValue } from "recoil";
import { Nullable } from "vitest";

export const getSampleSrc = (url: string) => {
  try {
    const { protocol } = new URL(url);
    if (["http:", "https:", "data:"].includes(protocol)) {
      return url;
    }
  } catch {}

  const params = getFetchParameters();
  const path = `${params.pathPrefix}/media`.replaceAll("//", "/");

  return `${params.origin}${path}?filepath=${encodeURIComponent(url)}`;
};

export const getSanitizedGroupByExpression = (expression: string) => {
  // todo: why this special case for sample_id...?
  if (expression === "sample_id") {
    return "_sample_id";
  }
  return expression;
};

export const mapSampleResponse = <
  T extends Nullable<{
    readonly sample?: Sample;
  }>
>(
  data: T
): T => {
  // This value may be a string that needs to be deserialized
  // Only occurs after calling useUpdateSample for pcd sample
  // - https://github.com/voxel51/fiftyone/pull/2622
  // - https://github.com/facebook/relay/issues/91
  if (data.sample && typeof data.sample === "string") {
    return {
      ...data,
      sample: JSON.parse(data.sample) as T["sample"],
    } as T;
  }

  return data;
};

export const fieldsMatcher = (
  fields: StrictField[],

  matcher: (field: StrictField) => boolean,
  present?: Set<string>,
  prefix = ""
): string[] => {
  return fields
    .filter((field) => matcher(field))
    .map((field) => `${prefix}${field.name}`)
    .filter((path) => !present || !present.has(path));
};

export const primitivesMatcher = (field: StrictField) => {
  if (field.name === "tags") {
    return false;
  }

  if (VALID_PRIMITIVE_TYPES.includes(field.ftype)) {
    return true;
  }

  if (
    field.ftype === LIST_FIELD &&
    VALID_PRIMITIVE_TYPES.includes(field.subfield)
  ) {
    return true;
  }

  return false;
};

export const groupFilter = (field: StrictField) => {
  if (LABELS.includes(field.embeddedDocType)) {
    return false;
  }

  if (field.ftype === EMBEDDED_DOCUMENT_FIELD) {
    return true;
  }

  if (
    field.ftype === LIST_FIELD &&
    field.subfield === EMBEDDED_DOCUMENT_FIELD
  ) {
    return true;
  }

  return false;
};

export const labelsMatcher =
  (parent: StrictField | null = null) =>
  (field: StrictField) => {
    if (parent?.ftype === LIST_FIELD) {
      return false;
    }

    if (field.ftype !== EMBEDDED_DOCUMENT_FIELD) {
      return false;
    }
    if (!LABELS.includes(field.embeddedDocType)) {
      return false;
    }

    return true;
  };

export const unsupportedMatcher = (field: StrictField) => {
  if (UNSUPPORTED_FILTER_TYPES.includes(field.ftype)) {
    return true;
  }

  if (
    field.ftype === LIST_FIELD &&
    (UNSUPPORTED_FILTER_TYPES.includes(field.subfield) || !field.subfield)
  ) {
    return true;
  }

  if (
    field.ftype === LIST_FIELD &&
    field.subfield === EMBEDDED_DOCUMENT_FIELD &&
    LABELS.includes(field.embeddedDocType)
  ) {
    return true;
  }

  return false;
};

export const getLabelFields = (fields: StrictField[], prefix = "") => [
  ...fieldsMatcher(fields || [], labelsMatcher(), undefined, prefix),
  ...getEmbeddedLabelFields(fields, prefix),
];

export const getEmbeddedLabelFields = (fields: StrictField[], prefix = "") =>
  fields
    .filter(groupFilter)
    .map((parent) =>
      fieldsMatcher(
        parent.fields || [],
        labelsMatcher(parent),
        undefined,
        `${prefix}${parent.name}.`
      )
    )
    .flat();

export type Range = [number | null | undefined, number | null | undefined];

export function useAssertedRecoilValue<T>(recoilValue: RecoilValue<T>) {
  const value = useRecoilValue(recoilValue);

  if (!value) {
    throw new Error(`${recoilValue.key} is not defined`);
  }

  return value;
}
