import { useEffect, useRef, useState } from "react";

export default function useTimeout(time: number) {
  const [pending, setPending] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!timerRef.current) {
      timerRef.current = setTimeout(() => {
        setPending(false);
      }, time);
    }

    return () => {
      const timerId = timerRef.current;
      if (timerId) clearTimeout(timerId);
    };
  }, [time]);

  return pending;
}
