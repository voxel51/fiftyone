import { useMemo } from "react";

export type Records = Map<string, number>;

export default (clear: string) => {
  return useMemo(() => {
    clear;
    return new Map<string, number>();
  }, [clear]);
};
