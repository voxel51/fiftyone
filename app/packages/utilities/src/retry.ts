import pRetry, { AbortError } from "p-retry";

export const abortRetry = (message?: string) => {
  throw new AbortError(message);
};

export const retry = pRetry;
