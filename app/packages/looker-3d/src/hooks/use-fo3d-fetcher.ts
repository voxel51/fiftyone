import { getFetchFunction } from "@fiftyone/utilities";
import { useCallback } from "react";
import { getFo3dRoot } from "../fo3d/utils";
import { FiftyoneSceneRawJson } from "../utils";

export default () => {
  const fetcher = useCallback(async (url: string, filepath: string) => {
    const root = getFo3dRoot(filepath);
    const response: FiftyoneSceneRawJson = await getFetchFunction()(
      "POST",
      "/resolve-fo3d",
      {
        url,
        root,
      },
      "json",
      2
    );
    return response;
  }, []);

  return fetcher;
};
