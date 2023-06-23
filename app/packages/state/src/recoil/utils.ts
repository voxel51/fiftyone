import { Sample } from "@fiftyone/looker";
import { getFetchOrigin, getFetchPathPrefix } from "@fiftyone/utilities";
import { Nullable } from "vitest";

export const getSampleSrc = (url: string) => {
  try {
    const { protocol } = new URL(url);
    if (["http:", "https:"].includes(protocol)) {
      return url;
    }
  } catch {}

  return `${getFetchOrigin()}${getFetchPathPrefix()}/media?filepath=${encodeURIComponent(
    url
  )}`;
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
