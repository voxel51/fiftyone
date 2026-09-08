import { useRef, type MutableRefObject } from "react";

/**
 * Returns a stable ref updated during render, matching a direct
 * `ref.current = value` assignment.
 */
export function useLatestRef<Value>(value: Value): MutableRefObject<Value> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
