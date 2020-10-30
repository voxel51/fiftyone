import { useEffect, useState } from "react";
import { useRecoilValue } from "recoil";

import * as selectors from "../recoil/selectors";
import { getSocket, useSubscribe } from "../utils/socket";
import tile from "../utils/tile";

export default () => {
  const socket = useRecoilValue(selectors.socket);
  const [state, setState] = useState({
    initialized: false,
    loadMore: false,
    isLoading: false,
    hasMore: true,
    pageToLoad: 1,
    rows: [],
    remainder: [],
  });
  const [prevFilters, setPrevFilters] = useState({});
  const filters = useRecoilValue(selectors.paginatedFilterStages);
  const clearState = () =>
    setState({
      initialized: false,
      loadMore: false,
      isLoading: false,
      hasMore: true,
      rows: [],
      pageToLoad: 1,
      remainder: [],
    });

  useSubscribe(socket, "update", () => clearState());
  useEffect(() => {
    clearState();
    setPrevFilters(filters);
  }, [JSON.stringify(filters) === JSON.stringify(prevFilters)]);

  useEffect(() => {
    if (!state.loadMore || state.isLoading || !state.hasMore) return;
    setState({ ...state, isLoading: true, loadMore: false, initialized: true });
    socket.emit("page", state.pageToLoad, (data) => {
      setState(tile(data.results, data.more, state));
    });
  }, [state.loadMore, state.pageToLoad, state.hasMore]);

  return [state, setState];
};
