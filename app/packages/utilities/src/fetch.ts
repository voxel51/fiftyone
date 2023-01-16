import {
  EventSourceMessage,
  fetchEventSource,
} from "@microsoft/fetch-event-source";
import fetchRetry from "fetch-retry";
import { isElectron } from "./electron";

import { NetworkError, ServerError } from "./errors";

let fetchOrigin: string;
let fetchFunctionSingleton: FetchFunction;
let fetchHeaders: HeadersInit;
let fetchPathPrefix = "";

export interface FetchFunction {
  <A, R>(
    method: string,
    path: string,
    body?: A,
    result?: "json" | "blob" | "arrayBuffer",
    retries?: number,
    retryCodes?: number[] | "arrayBuffer"
  ): Promise<R>;
}

export const getFetchFunction = () => {
  return fetchFunctionSingleton;
};

export const getFetchHeaders = () => {
  return fetchHeaders;
};

export const getFetchOrigin = () => {
  // window is not defined in the web worker
  if (typeof window !== "undefined" && window.FIFTYONE_SERVER_ADDRESS) {
    return window.FIFTYONE_SERVER_ADDRESS;
  }
  return fetchOrigin;
};
export function getFetchPathPrefix(): string {
  // window is not defined in the web worker
  if (
    typeof window !== "undefined" &&
    typeof window.FIFTYONE_SERVER_PATH_PREFIX === "string"
  ) {
    return window.FIFTYONE_SERVER_PATH_PREFIX;
  }

  return (
    new URL(window.location.toString()).searchParams.get("proxy") ||
    fetchPathPrefix
  );
}

export const getFetchParameters = () => {
  return {
    origin: getFetchOrigin(),
    headers: getFetchHeaders(),
    pathPrefix: getFetchPathPrefix(),
  };
};

export const setFetchFunction = (
  origin: string,
  headers: HeadersInit = {},
  pathPrefix = ""
) => {
  fetchHeaders = headers;
  fetchOrigin = origin;
  fetchPathPrefix = pathPrefix;
  const fetchFunction: FetchFunction = async (
    method,
    path,
    body = null,
    result = "json",
    retries = 2,
    retryCodes = [502, 503, 504]
  ) => {
    let url: string;

    if (fetchPathPrefix) {
      path = `${fetchPathPrefix}${path}`;
    }

    try {
      new URL(path);
      url = path;
    } catch {
      url = `${origin}${
        !origin.endsWith("/") && !path.startsWith("/") ? "/" : ""
      }${path}`;
    }

    headers = {
      "Content-Type": "application/json",
      ...headers,
    };

    const fetchCall = retries
      ? fetchRetry(fetch, {
          retries,
          retryDelay: 0,
          retryOn: (attempt, error, response) => {
            if (
              error !== null ||
              (retryCodes.includes(response.status) && attempt < retries)
            ) {
              return true;
            }
          },
        })
      : fetch;

    const response = await fetchCall(url, {
      method: method,
      cache: "no-cache",
      headers,
      mode: "cors",
      body: body ? JSON.stringify(body) : null,
    });

    if (response.status >= 400) {
      try {
        const error = await response.json();

        throw new ServerError(
          {
            code: response.status,
            statusText: response.statusText,
            bodyResponse: error,
            route: response.url,
            payload: body as object,
            stack: (error as unknown as { stack: string }).stack,
            requestHeaders: headers,
            responseHeaders: response.headers,
          },
          error.message
        );
      } catch {
        let bodyResponse = "";

        try {
          bodyResponse = await response.text();
        } catch {}
        throw new NetworkError(
          {
            code: response.status,
            statusText: response.statusText,
            bodyResponse,
            route: response.url,
            payload: body as object,
            requestHeaders: headers,
            responseHeaders: response.headers,
          },
          response.statusText
        );
      }
    }

    return await response[result]();
  };

  fetchFunctionSingleton = fetchFunction;
};

const isWorker =
  // @ts-ignore
  typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope;
const hasWindow = typeof window !== "undefined" && !isWorker;

export const getAPI = () => {
  if (import.meta.env?.VITE_API) {
    return import.meta.env.VITE_API;
  }
  if (window.FIFTYONE_SERVER_ADDRESS) {
    return window.FIFTYONE_SERVER_ADDRESS;
  }
  return isElectron()
    ? `http://${process.env.FIFTYONE_SERVER_ADDRESS || "localhost"}:${
        process.env.FIFTYONE_SERVER_PORT || 5151
      }`
    : window.location.origin;
};

if (hasWindow) {
  setFetchFunction(getAPI(), {}, getFetchPathPrefix());
}

class RetriableError extends Error {}
class FatalError extends Error {}

const polling =
  hasWindow &&
  typeof new URLSearchParams(window.location.search).get("polling") ===
    "string";

export const getEventSource = (
  path: string,
  events: {
    onmessage?: (event: EventSourceMessage) => void;
    onopen?: () => void;
    onclose?: () => void;
    onerror?: (error: Error) => void;
  },
  signal: AbortSignal,
  body = {}
): void => {
  if (polling) {
    pollingEventSource(path, events, signal, body);
  } else {
    if (fetchPathPrefix) {
      path = `${fetchPathPrefix}${path}`;
    }

    fetchEventSource(`${getFetchOrigin()}${path}`, {
      headers: { "Content-Type": "text/event-stream" },
      method: "POST",
      signal,
      body: JSON.stringify(body),
      async onopen(response) {
        if (response.ok) {
          events.onopen && events.onopen();
          return;
        }

        if (response.status !== 429) {
          throw new FatalError();
        }

        throw new RetriableError();
      },
      onmessage(msg) {
        if (msg.event === "FatalError") {
          throw new FatalError(msg.data);
        }
        events.onmessage && events.onmessage(msg);
      },
      onclose() {
        events.onclose && events.onclose();
        throw new RetriableError();
      },
      onerror(err) {
        if (
          err instanceof TypeError &&
          ["Failed to fetch", "network error"].includes(err.message)
        ) {
          events.onclose && events.onclose();
          return;
        }

        events.onerror && events.onerror(err);
      },
      fetch: async (input, init) => {
        try {
          const response = await fetch(input, init);
          if (response.status >= 400) {
            let err;
            try {
              err = await response.json();
            } catch {
              throw new Error(`${response.status} ${response.url}`);
            }

            throw new ServerError(
              {},
              (err as unknown as { stack: string }).stack
            );
          }

          return response;
        } catch (err) {
          throw err;
        }
      },
      openWhenHidden: true,
    });
  }
};

export const sendEvent = async (data: {}) => {
  return await getFetchFunction()("POST", "event", data);
};

interface PollingEventResponse {
  event: string;
  data: {
    [key: string]: any;
  };
}

const pollingEventSource = (
  path: string,
  events: {
    onmessage?: (event: EventSourceMessage) => void;
    onopen?: () => void;
    onclose?: () => void;
    onerror?: (error: Error) => void;
  },
  signal: AbortSignal,
  body = {},
  opened: boolean = false
): void => {
  if (signal.aborted) {
    return;
  }

  getFetchFunction()("POST", path, { polling: true, ...body })
    .then(({ events: data }: { events: PollingEventResponse[] }) => {
      if (signal.aborted) {
        return;
      }

      if (!opened) {
        events.onopen && events.onopen();
        opened = true;
      }

      data.forEach((e) => {
        events.onmessage &&
          events.onmessage({
            id: null,
            event: e.event,
            data: JSON.stringify(e.data),
          });
      });

      setTimeout(
        () => pollingEventSource(path, events, signal, body, opened),
        2000
      );
    })
    .catch((error) => {
      if (
        error instanceof TypeError &&
        ["Failed to fetch", "network error"].includes(error.message)
      ) {
        events.onclose && events.onclose();
        opened = false;
      } else {
        // todo: use onerror when appropriate? (colab network responses are unreliable)
        events.onclose && events.onclose();
      }

      setTimeout(
        () => pollingEventSource(path, events, signal, body, opened),
        2000
      );
    });
};
