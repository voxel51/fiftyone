// NOTE: CODE FORK

import { getFetchFunction } from "@fiftyone/utilities";
import { useCallback } from "react";
import type { FiftyoneSceneRawJson } from "../utils";

/**
 * Returns a memoized fetcher for loading raw fo3d scene JSON by URL.
 */
export default () => {
  const fetcher = useCallback(async (url: string, _filepath: string) => {
    const response: FiftyoneSceneRawJson = await getFetchFunction({
      cache: true,
    })("GET", url);
    return response;
  }, []);

  return fetcher;
};

export const useUrlModifier = (_fo3dRoot: string) => {
  // no-op in OSS
};
