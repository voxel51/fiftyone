import { useCallback, useEffect, useRef, useState } from "react";
import ResizeObserver from "resize-observer-polyfill";

export const useEventHandler = (target, eventType, handler) => {
  // Adapted from https://reactjs.org/docs/hooks-faq.html#what-can-i-do-if-my-effect-dependencies-change-too-often
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!target) {
      return;
    }
    const wrapper = (e) => handlerRef.current(e);
    target.addEventListener(eventType, wrapper);
    return () => {
      target.removeEventListener(eventType, wrapper);
    };
  }, [target, eventType]);
};

export const useObserve = (target, handler) => {
  const handlerRef = useRef(handler);
  const observerRef = useRef(new ResizeObserver(() => handlerRef.current()));

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!target) {
      return;
    }
    observerRef.current.observe(target);
    return () => observerRef.current.unobserve(target);
  }, [target]);
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

export const useFollow = (leaderRef, followerRef, set) => {
  const follow = () => {
    if (
      !leaderRef ||
      !leaderRef.current ||
      !followerRef ||
      !followerRef.current
    ) {
      return;
    }
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

  useEventHandler(window, "scroll", follow);
  useEventHandler(leaderRef ? leaderRef.current : null, "scroll", follow);
  useObserve(followerRef ? followerRef.current : null, follow);
};

// allows re-rendering before recoil's Batcher updates
export const useFastRerender = () => {
  const [counter, setCounter] = useState(0);
  const rerender = useCallback(() => {
    setCounter((prev) => prev + 1);
  }, []);
  return rerender;
};
