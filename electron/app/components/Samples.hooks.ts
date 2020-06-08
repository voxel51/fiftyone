import { wrap, releaseProxy } from "comlink";
import { useEffect, useState, useMemo } from "react";
import { getSocket, useSubscribe } from "../utils/socket";

export default (port) => {
  const [state, setState] = useState({
    loadMore: false,
    isLoading: false,
    hasMore: true,
    pageToLoad: 1,
    rows: [],
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
    });
  });

  useEffect(() => {
    if (!state.loadMore || state.isLoading || !state.hasMore) return;
    setState({ ...state, isLoading: true, loadMore: false });
    socket.emit("page", state.pageToLoad, (data) => {
      setState({
        rows: [...state.rows, ...data.rows],
        hasMore: Boolean(data.more),
        isLoading: false,
        pageToLoad: data.more,
      });
    });
  }, [state.loadMore, state.pageToLoad, state.hasMore]);

  return [state, setState];
};
