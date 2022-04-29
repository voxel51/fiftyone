import {
  EventSourceMessage,
  fetchEventSource,
} from "@microsoft/fetch-event-source";

import { ServerError } from "./errors";

let fetchOrigin: string;
let fetchFunctionSingleton: FetchFunction;
let fetchHeaders: HeadersInit;

export interface FetchFunction {
  <A, R>(
    method: string,
    path: string,
    body?: A,
    result?: "json" | "blob"
  ): Promise<R>;
}

export const getFetchFunction = () => {
  return fetchFunctionSingleton;
};

export const getFetchHeaders = () => {
  return fetchHeaders;
};

export const getFetchOrigin = () => {
  return fetchOrigin;
};

export const getFetchParameters = () => {
  return {
    origin: getFetchOrigin(),
    headers: getFetchHeaders(),
  };
};

export const setFetchFunction = (origin: string, headers: HeadersInit = {}) => {
  fetchHeaders = headers;
  fetchOrigin = origin;
  const fetchFunction: FetchFunction = async (
    method,
    path,
    body = null,
    result = "json"
  ) => {
    let url: string;
    try {
      new URL(path);
      origin = path;
    } catch {
      url = `${origin}${path}`;
    }

    const response = await fetch(url, {
      method: method,
      cache: "no-cache",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      mode: "cors",
      body: body ? JSON.stringify(body) : null,
    });

    if (response.status >= 400) {
      const error = await response.json();
      throw new ServerError(((error as unknown) as { stack: string }).stack);
    }

    return await response[result]();
  };

  fetchFunctionSingleton = fetchFunction;
};

class RetriableError extends Error {}
class FatalError extends Error {}

export const getEventSource = (
  path: string,
  events: {
    onmessage?: (ev: EventSourceMessage) => void;
    onopen?: (response: Response) => Promise<void>;
    onclose?: () => void;
    onerror?: (err: any) => number | null | undefined | void;
  },
  signal: AbortSignal,
  body = {}
) =>
  fetchEventSource(`${getFetchOrigin()}${path}`, {
    method: "POST",
    signal,
    body: JSON.stringify(body),
    async onopen(response) {
      if (response.ok) {
        events.onopen && events.onopen(response);
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

          throw new ServerError(((err as unknown) as { stack: string }).stack);
        }

        return response;
      } catch (err) {
        throw err;
      }
    },
    openWhenHidden: true,
  });

export const sendEvent = async (eventName: string, data: {}) => {
  return await getFetchFunction()("POST", "/event", data);
};
