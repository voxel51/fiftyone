import { wrap, releaseProxy } from "comlink";
import { useEffect, useState, useMemo } from "react";
import { getSocket, useSubscribe } from "../utils/socket";

/**
 * Our hook that performs the calculation on the worker
 */
export function tile(port, loadMore, count) {
  // We'll want to expose a wrapping object so we know when a calculation is in progress
  const [state, setState] = useState({
    isLoading: true,
    hasMore: true,
    pageToLoad: 1,
    rows: [],
    remainder: [],
  });

  const host = `http://127.0.0.1:${port}`;
  const socket = getSocket(port, "state");
  useSubscribe(socket, "update", (data) => {
    setState({
      isLoading: true,
      hasMore: true,
      rows: [],
      pageToLoad: 1,
      remainder: [],
    });
  });

  // acquire our worker
  const { workerApi } = useWorker();

  useEffect(() => {
    if (!loadMore) return;
    setState({ ...state, isLoading: true });

    socket.emit("page", state.pageToLoad, (data) => {
      workerApi
        .tile(data, state, count, host)
        .then((result) => setState(result)); // We receive the result here
    });
  }, [workerApi, setState, loadMore, count]);

  return state;
}

function useWorker() {
  // memoise a worker so it can be reused; create one worker up front
  // and then reuse it subsequently; no creating new workers each time
  const [workerApiAndCleanup, _] = useState(() => makeWorkerApiAndCleanup());

  useEffect(() => {
    const { cleanup } = workerApiAndCleanup;

    // cleanup our worker when we're done with it
    return () => {
      cleanup();
    };
  }, [workerApiAndCleanup]);

  return workerApiAndCleanup;
}

/**
 * Creates a worker, a cleanup function and returns it
 */
function makeWorkerApiAndCleanup() {
  // Here we create our worker and wrap it with comlink so we can interact with it
  const worker = new Worker("../workers/tiler", {
    name: "tiler",
    type: "module",
  });
  const workerApi = wrap<import("../workers/tiler").Tiler>(worker);

  // A cleanup function that releases the comlink proxy and terminates the worker
  const cleanup = () => {
    workerApi[releaseProxy]();
    worker.terminate();
  };

  const workerApiAndCleanup = { workerApi, cleanup };

  return workerApiAndCleanup;
}
