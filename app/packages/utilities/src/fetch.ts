import { ServerError } from "./errors";

let fetchHost: string;
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

export const getFetchHost = () => {
  return fetchHost;
};

export const getFetchParameters = (): Parameters<typeof setFetchFunction> => {
  return [getFetchHost(), getFetchHeaders()];
};

export const setFetchFunction = (host: string, headers: HeadersInit) => {
  fetchHeaders = headers;
  fetchHost = host;
  const fetchFunction: FetchFunction = async (
    method,
    path,
    body = null,
    result = "json"
  ) => {
    let url: string;
    try {
      new URL(path);
      host = path;
    } catch {
      url = `${host}${path}`;
    }

    const response = await fetch(url, {
      method: method,
      cache: "no-cache",
      headers,
      mode: "cors",
      body: body ? JSON.stringify(body) : null,
    });

    if (response.status === 500) {
      const error = await response.json();
      throw new ServerError(((error as unknown) as { stack: string }).stack);
    }

    return await response[result]();
  };

  fetchFunctionSingleton = fetchFunction;
};
