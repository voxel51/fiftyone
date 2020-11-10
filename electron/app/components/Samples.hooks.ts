import { useEffect, useState } from "react";
import { useRecoilValue } from "recoil";
import { useMessageHandler } from "../utils/hooks";
import tile from "../utils/tile";
import { packageMessage } from "../utils/socket";

import * as selectors from "../recoil/selectors";

export default () => {
  const socket = useRecoilValue(selectors.socket);
  const [prevFilters, setPrevFilters] = useState({});
  const filters = useRecoilValue(selectors.paginatedFilterStages);
  const view = useRecoilValue(selectors.view);

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

  useMessageHandler("update", () => {
    setState(empty);
  });
  useEffect(() => {
    setState(empty);
    setPrevFilters(filters);
  }, [JSON.stringify(filters) === JSON.stringify(prevFilters)]);
  useEffect(() => {
    setState(empty);
  }, [view]);

  useEffect(() => {
    if (!state.loadMore || state.isLoading || !state.hasMore) return;
    setState({ ...state, isLoading: true, loadMore: false, initialized: true });
    socket.send(packageMessage("page", { page: state.pageToLoad }));
  }, [state.loadMore, state.pageToLoad, state.hasMore]);

  return [state, setState];
};
