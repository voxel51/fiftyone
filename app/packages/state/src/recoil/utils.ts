import { getFetchOrigin } from "@fiftyone/utilities";
import { MutableRefObject } from "react";

export const getSampleSrc = (filepath: string, id: string, url?: string) => {
  if (url) {
    return url;
  }

  return `${getFetchOrigin()}/media?filepath=${encodeURIComponent(
    filepath
  )}&id=${id}`;
};
