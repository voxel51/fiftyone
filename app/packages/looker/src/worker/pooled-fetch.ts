import { fetchWithLinearBackoff } from "./decorated-fetch";

interface QueueItem {
  request: {
    url: string;
    options?: RequestInit;
  };
  resolve: (value: Response | PromiseLike<Response>) => void;
  reject: (reason?: any) => void;
}

// note: arbitrary number that seems to work well
const MAX_CONCURRENT_REQUESTS = 100;

let activeRequests = 0;
const requestQueue: QueueItem[] = [];

export const enqueueFetch = (request: {
  url: string;
  options?: RequestInit;
}): Promise<Response> => {
  return new Promise((resolve, reject) => {
    requestQueue.push({ request, resolve, reject });
    processFetchQueue();
  });
};

const processFetchQueue = () => {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS || requestQueue.length === 0) {
    return;
  }

  const { request, resolve, reject } = requestQueue.shift();
  activeRequests++;

  fetchWithLinearBackoff(request.url, request.options)
    .then((response) => {
      activeRequests--;
      resolve(response);
      processFetchQueue();
    })
    .catch((error) => {
      activeRequests--;
      reject(error);
    });
};
