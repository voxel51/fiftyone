import type { MutableRefObject } from "react";
import { useMemo, useRef } from "react";

export type Records = MutableRefObject<Map<string, number>>;

export default (clear: string) => {
  const records = useRef(new Map<string, number>());

  useMemo(() => {
    clear;
    records.current.clear();
  }, [clear]);

  return records;
};
