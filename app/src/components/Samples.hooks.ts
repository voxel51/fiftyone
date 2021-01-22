import { useEffect, useState } from "react";
import { useRecoilValue } from "recoil";
import { useMessageHandler } from "../utils/hooks";
import tile from "../utils/tile";
import { packageMessage } from "../utils/socket";
import { filterView } from "../utils/view";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";

const stringifyObj = (obj) => {
  if (typeof obj !== "object" || Array.isArray(obj)) return obj;
  return JSON.stringify(
    Object.keys(obj)
      .map((key) => {
        return [key, obj[key]];
      })
      .sort((a, b) => a[0] - b[0])
  );
};

export default () => {
  const socket = useRecoilValue(selectors.socket);
  const filters = useRecoilValue(selectors.filterStages);
  const datasetName = useRecoilValue(selectors.datasetName);
  const view = useRecoilValue(selectors.view);
  const refresh = useRecoilValue(atoms.refresh);

  const empty = {
    initialized: false,
    loadMore: false,
    isLoading: false,
    hasMore: true,
    pageToLoad: 1,
    rows: [],
    remainder: [],
  };
  const [state, setState] = useState(empty);

  useMessageHandler("page", ({ results, more }) => {
    setState(tile(results, more, state));
  });

  useEffect(() => {
    setState(empty);
  }, [filterView(view), datasetName, refresh, stringifyObj(filters)]);

  useEffect(() => {
    if (!state.loadMore || state.isLoading || !state.hasMore) return;
    setState({ ...state, isLoading: true, loadMore: false, initialized: true });
    socket.send(packageMessage("page", { page: state.pageToLoad }));
  }, [state.loadMore, state.pageToLoad, state.hasMore]);

  return [state, setState];
};
