import { useEffect, useRef } from "react";

const useEventHandler = (target, eventType, handler, useCapture = false) => {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!target) return;

    const wrapper = (e) => handlerRef.current(e);
    target && target.addEventListener(eventType, wrapper, useCapture);

    return () => {
      target && target.removeEventListener(eventType, wrapper);
    };
  }, [target, eventType]);
};

export default useEventHandler;
