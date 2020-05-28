import { wrap, releaseProxy } from "comlink";
import { useEffect, useState, useMemo } from "react";

/**
 * Our hook that performs the calculation on the worker
 */
export function tile(g) {
  // We'll want to expose a wrapping object so we know when a calculation is in progress
  const [data, setData] = useState({
    isLoading: true,
    initialLoad: true,
    hasMore: true,
    rows: [],
    pageToLoad: 1,
  });

  // acquire our worker
  const { workerApi } = useWorker();

  useEffect(() => {
    // We're starting the calculation here
    setData({ ...data, isLoading: true });

    workerApi
      .tile(data)
      .then((result) => setData({ ...result, isLoading: false })); // We receive the result here
  }, [workerApi, setData]);

  return data;
}

function useWorker() {
  // memoise a worker so it can be reused; create one worker up front
  // and then reuse it subsequently; no creating new workers each time
  const workerApiAndCleanup = useMemo(() => makeWorkerApiAndCleanup(), []);

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
