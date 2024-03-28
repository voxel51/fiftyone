import { getFetchFunction } from "@fiftyone/utilities";
import { useCallback } from "react";
import { FiftyoneSceneRawJson } from "../utils";

export default () => {
  const fetcher = useCallback(async (url: string, _filepath: string) => {
    const response: FiftyoneSceneRawJson = await getFetchFunction()("GET", url);
    return response;
  }, []);

  return fetcher;
};
