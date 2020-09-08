import { wrap, releaseProxy } from "comlink";
import { useEffect, useState, useMemo } from "react";
import { useRecoilValue } from "recoil";
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

  const host = `http://127.0.0.1:${port}`;
  const socket = getSocket(port, "state");
  useSubscribe(socket, "update", (data) => {
    setState({
      loadMore: false,
      isLoading: false,
      hasMore: true,
      rows: [],
      pageToLoad: 1,
      remainder: [],
    });
  });

  useEffect(() => {
    if (!state.loadMore || state.isLoading || !state.hasMore) return;
    setState({ ...state, isLoading: true, loadMore: false });
    socket.emit("page", state.pageToLoad, (data) => {
      setState(tile(data.results, data.more, state, host));
    });
  }, [state.loadMore, state.pageToLoad, state.hasMore]);

  return [state, setState];
};
