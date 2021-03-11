import { useEffect, useState } from "react";
import { useRecoilValue, useRecoilState } from "recoil";
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

const empty = {
  loadMore: false,
  isLoading: false,
  hasMore: true,
  pageToLoad: null,
};

export default () => {
  const socket = useRecoilValue(selectors.socket);
  const filters = useRecoilValue(selectors.filterStages);
  const datasetName = useRecoilValue(selectors.datasetName);
  const view = useRecoilValue(selectors.view);
  const refresh = useRecoilValue(selectors.refresh);
  const [state, setState] = useState(empty);
  const [rows, setRows] = useRecoilState(atoms.scrollRows);

  useMessageHandler("page", ({ results, more }) => {
    const [newState, newRows] = tile(results, more, state, rows);

    setState(newState);
    setRows(newRows);
  });

  useEffect(() => {
    setState(empty);
    setRows({ rows: [], remainder: [] });
  }, [filterView(view), datasetName, refresh, stringifyObj(filters)]);

  useEffect(() => {
    if (!state.loadMore || state.isLoading || !state.hasMore) return;
    const page = state.pageToLoad ? state.pageToLoad + 1 : 1;
    setState({
      ...state,
      isLoading: true,
      loadMore: false,
      pageToLoad: page,
    });
    socket.send(packageMessage("page", { page }));
  }, [state]);

  return [rows.rows, state, setState];
};
