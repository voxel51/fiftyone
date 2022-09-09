import { getFetchOrigin } from "@fiftyone/utilities";

export const getSampleSrc = (url: string) => {
  try {
    const { protocol } = new URL(url);
    if (["http", "https"].includes(protocol)) {
      return url;
    }
  } catch {}

  return `${getFetchOrigin()}/media?filepath=${encodeURIComponent(url)}`;
};
