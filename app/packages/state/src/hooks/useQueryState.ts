import { useCallback, useContext } from "react";
import qs from "qs";
import { RouterContext } from "../routing";
import { useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";

const useQueryState = (query) => {
  const router = useContext(RouterContext);
  const dataset = useRecoilValue(fos.dataset);

  const setQuery = useCallback(
    (value) => {
      try {
        const existingQueries = qs.parse(location.search, {
          ignoreQueryPrefix: true,
        });

        // don't change state/route in jupyter notebook or similar environments.
        if (existingQueries?.["context"] === "ipython") {
          return;
        }

        const queryString = qs.stringify(
          { ...existingQueries, [query]: value },
          { skipNulls: true }
        );

        if (router.history.location.state.state) {
          router.history.push(`${location.pathname}?${queryString}`, {
            state: {
              ...router.history.location.state.state,
              selected: [],
              selectedLabels: [],
              ...(dataset.viewCls ? { viewCls: dataset.viewCls } : {}),
              ...(dataset ? { dataset } : {}),
            },
          });
        }
      } catch (e) {
        console.error("setSavedViewParam", e);
      }
    },
    [history, location, query]
  );

  return [
    qs.parse(location.search, { ignoreQueryPrefix: true })[query],
    setQuery,
  ];
};

export default useQueryState;
