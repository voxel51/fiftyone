import React from "react";

import { isElectron } from "@fiftyone/utilities";
import { ServerError } from "../Error/Error";

const host = import.meta.env.DEV ? "localhost:5151" : window.location.host;

export const port = isElectron()
  ? parseInt(process.env.FIFTYONE_SERVER_PORT) || 5151
  : parseInt(window.location.port);

const address = isElectron()
  ? process.env.FIFTYONE_SERVER_ADDRESS || "localhost"
  : window.location.hostname;

export const http = isElectron()
  ? `http://${address}:${port}`
  : window.location.protocol + "//" + host;

export const createFetchFunction = (headers: HeadersInit) => {
  const fetchFunction = async <A, R>(
    method: string,
    path: string,
    data: A
  ): Promise<R> => {
    const url = `${http}path`;

    const response = await fetch(url, {
      method: method,
      cache: "no-cache",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      mode: "cors",
      body: JSON.stringify(data),
    });

    const result = response.json();

    if (response.status === 500) {
      throw new ServerError(((result as unknown) as { stack: string }).stack);
    }

    return result;
  };

  return fetchFunction;
};

export default React.createContext(createFetchFunction());
