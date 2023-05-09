import { getFetchOrigin, getFetchPathPrefix } from "@fiftyone/utilities";

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
