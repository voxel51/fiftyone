import { useEffect, useState } from "react";
import { useRecoilValue } from "recoil";

import * as selectors from "../recoil/selectors";
import { getSocket, useSubscribe } from "../utils/socket";
import tile from "../utils/tile";

export default (port) => {
  const [state, setState] = useState({
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
      loadMore: false,
      isLoading: false,
      hasMore: true,
      rows: [],
      pageToLoad: 1,
      remainder: [],
    });

  const host = `http://127.0.0.1:${port}`;
  const socket = getSocket(port, "state");
  useSubscribe(socket, "update", () => clearState());
  useEffect(() => {
    clearState();
    setPrevFilters(filters);
  }, [JSON.stringify(filters) === JSON.stringify(prevFilters)]);

  useEffect(() => {
    if (!state.loadMore || state.isLoading || !state.hasMore) return;
    setState({ ...state, isLoading: true, loadMore: false });
    socket.emit("page", state.pageToLoad, (data) => {
      setState(tile(data.results, data.more, state, host));
    });
  }, [state.loadMore, state.pageToLoad, state.hasMore]);

  return [state, setState];
};
