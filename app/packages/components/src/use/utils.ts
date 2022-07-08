import { MutableRefObject } from "react";

export const deferrer =
  (initialized: MutableRefObject<boolean>) =>
  (fn: (...args: any[]) => void) =>
  (...args: any[]): void => {
    if (initialized.current) fn(...args);
  };

export const stringifyObj = (obj) => {
  if (typeof obj !== "object" || Array.isArray(obj)) return obj;
  return JSON.stringify(
    Object.keys(obj)
      .map((key) => {
        return [key, obj[key]];
      })
      .sort((a, b) => a[0] - b[0])
  );
};
