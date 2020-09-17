import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export const useEventHandler = (target, eventType, handler) => {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const wrapper = (e) => handlerRef.current(e);
    target.addEventListener(eventType, wrapper);
    return () => {
      target.removeEventListener(eventType, wrapper);
    };
  }, [target, eventType]);
};

export const useResizeHandler = (handler) =>
  useEventHandler(window, "resize", handler);

export const useScrollHandler = (handler) =>
  useEventHandler(window, "scroll", handler);

export const useKeydownHandler = (handler) =>
  useEventHandler(document.body, "keydown", handler);

export const useOutsideClick = (ref, handler) => {
  const handleClickOutside = (event) => {
    if (ref.current && !ref.current.contains(event.target)) {
      handler(event);
    }
  };

  useEventHandler(document, "mousedown", handleClickOutside);
};

export const useFollow = (leaderRef, followerRef, set, deps = []) => {
  useLayoutEffect(() => {
    const follow = () => {
      const { x, y } = followerRef.current.getBoundingClientRect();
      const {
        x: leaderX,
        width: leaderWidth,
      } = leaderRef.current.getBoundingClientRect();
      set({
        left: x,
        top: y,
        opacity: x - leaderX < 0 || x > leaderX + leaderWidth ? 0 : 1,
      });
    };
    leaderRef.current &&
      followerRef.current &&
      (() => {
        leaderRef.current.addEventListener("scroll", follow);
        window.addEventListener("scroll", follow);
      })();
    return () =>
      leaderRef.current &&
      (() => {
        leaderRef.current.removeEventListener("scroll", follow);
        window.removeEventListener("scroll", follow);
      })();
  }, [leaderRef.current, followerRef.current, ...deps]);
};

// allows re-rendering before recoil's Batcher updates
export const useFastRerender = () => {
  const [counter, setCounter] = useState(0);
  const rerender = useCallback(() => {
    setCounter((prev) => prev + 1);
  }, []);
  return rerender;
};
