import { useLazyLoadQuery } from "react-relay";
import { productVersionQuery } from "@fiftyone/teams-state";

export default function useProductVersion() {
  // todo: use SSR
  const productVersion = useLazyLoadQuery(productVersionQuery, {});

  return productVersion?.version;
}
