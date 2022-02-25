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

export const getFetchParameters = (): Parameters<typeof setFetchFunction> => {
  return [getFetchOrigin(), getFetchHeaders()];
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

    try {
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
    } catch (error) {
      console.log(error);
    }
  };

  fetchFunctionSingleton = fetchFunction;
};

class RetriableError extends Error {}
class FatalError extends Error {}

export const getEventSource = (
  path: string,
  events: {
    onmessage: (ev: EventSourceMessage) => void;
    onopen?: (response: Response) => Promise<void>;
    onclose?: () => void;
    onerror?: (err: any) => number | null | undefined | void;
  },
  signal: AbortSignal
) =>
  fetchEventSource(`${getFetchOrigin()}${path}`, {
    method: "POST",
    signal,
    async onopen(response) {
      if (response.ok) {
        events.onopen(response);
        return;
      }

      if (
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 429
      ) {
        throw new FatalError();
      }

      throw new RetriableError();
    },
    onmessage(msg) {
      if (msg.event === "FatalError") {
        throw new FatalError(msg.data);
      }
      events.onmessage(msg);
    },
    onclose() {
      events.onclose();
      throw new RetriableError();
    },
    onerror(err) {
      if (err instanceof FatalError) {
        events.onerror(err);
      }
    },
  });
