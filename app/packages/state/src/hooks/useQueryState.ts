import { useCallback, useContext } from "react";
// import qs from "qs";
import { RouterContext } from "../routing";
import { useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";

const useQueryState = (query) => {
  const router = useContext(RouterContext);
  const dataset = useRecoilValue(fos.dataset);
  console.log("query:", query);
  const setQuery = useCallback(
    (value) => {
      console.log("setQuery useCallback value:", value);
      console.log("location.search", location.search);
      console.log(
        "router.history.location.state.state",
        router.history.location.state.state
      );
      // const existingQueries = qs.parse(location.search, {
      //   ignoreQueryPrefix: true,
      // });
      const queryString = window.location.search;
      const params = new URLSearchParams(queryString);
      const viewName = params.get("view");
      // const queryString = qs.stringify(
      //   {...existingQueries, [query]: value},
      //   {skipNulls: true}
      // );
      //
      // console.log('queryString: ', queryString); // always null and only
      // // triggered when set to dataset view (no saved view selected)
      // console.log("existingQueries: ", existingQueries); // always {} and only
      // // triggered when set to dataset view (no saved view selected)

      router.history.push(`${location.pathname}?${queryString}`, {
        state: {
          // ...router.history.location.state.state,
          selected: [],
          selectedLabels: [],
          view: [],
          viewCls: dataset.viewCls ? { viewCls: dataset.viewCls } : {},
          viewName: viewName,
        },
      });
    },
    [history, location, query]
  );

  return [
    qs.parse(location.search, { ignoreQueryPrefix: true })[query],
    setQuery,
  ];
};

export default useQueryState;
