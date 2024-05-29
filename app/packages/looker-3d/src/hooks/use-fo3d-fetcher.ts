// NOTE: CODE FORK

import { getFetchFunction, getFetchParameters } from "@fiftyone/utilities";
import { useCallback, useEffect } from "react";
import { DefaultLoadingManager } from "three";
import { getFo3dRoot } from "../fo3d/utils";
import { FiftyoneSceneRawJson } from "../utils";

export default () => {
  const fetcher = useCallback(async (url: string, filepath: string) => {
    const root = getFo3dRoot(filepath);
    const response: FiftyoneSceneRawJson = await getFetchFunction()(
      "GET",
      `/resolve-fo3d?url=${encodeURIComponent(url)}&root=${root}`,
      null,
      "json"
    );
    return response;
  }, []);

  return fetcher;
};

export const useUrlModifier = (fo3dRoot: string) => {
  const urlModifier = useCallback(
    (url: string) => {
      // check if it's unresolved cloud url (s3, gcp, minio, etc.)
      let isCloudPath = false;

      if (
        !url.startsWith("https://") &&
        !url.startsWith("http://") &&
        !url.startsWith("/") &&
        !url.startsWith("data:")
      ) {
        isCloudPath = true;
      }

      if (!isCloudPath) {
        return url;
      }

      const fetchParams = getFetchParameters();

      // NOTE: THIS IS A SYNCHRONOUS REQUEST
      // there's no way to make this async currently
      // at least it's a GET request and server should send appropriate cache-control headers

      // todo: investigate better way of loading textures in parallel outside of asset loaders
      // where we can make async requests

      try {
        const request = new XMLHttpRequest();
        const queryParams = new URLSearchParams();
        queryParams.append("cloud_path", url);
        request.open(
          "GET",
          `${fetchParams.origin}${fetchParams.pathPrefix}/signed-url?${queryParams}`,
          false
        );

        for (const [headerName, headerValue] of Object.entries(
          fetchParams.headers
        )) {
          request.setRequestHeader(headerName, headerValue);
        }

        request.send();

        const res = JSON.parse(request.responseText);

        return res["signed_url"];
      } catch (e) {
        console.error(e);
        return url;
      }
    },
    [fo3dRoot]
  );

  DefaultLoadingManager.setURLModifier(urlModifier);

  useEffect(() => {
    // note: setting URL modifier in effect doesn't seem to work

    return () => {
      DefaultLoadingManager.setURLModifier(null);
    };
  }, []);
};
