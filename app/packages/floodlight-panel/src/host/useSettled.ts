import { useEffect, useMemo, useRef, useState } from "react";
import { createSettle } from "./settle";

/** `value` once it has held still for `delay` ms; the first value at once. */
export const useSettled = <T>(value: T, delay: number) => {
  const [settled, setSettled] = useState(value);
  const latest = useRef(value);
  latest.current = value;
  const settle = useMemo(
    () => createSettle(() => setSettled(latest.current), delay),
    [delay],
  );

  useEffect(() => {
    if (!Object.is(value, settled)) settle.trigger();
  }, [settle, settled, value]);
  useEffect(() => settle.cancel, [settle]);

  return settled;
};
