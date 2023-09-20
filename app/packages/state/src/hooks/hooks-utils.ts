import React, { useCallback, useEffect, useRef, useState } from "react";

import { toCamelCase } from "@fiftyone/utilities";
import ResizeObserver from "resize-observer-polyfill";

import { State, StateResolver, transformDataset, useStateUpdate } from "../";

interface EventTarget {
  addEventListener: HTMLElement["addEventListener"];
  removeEventListener: HTMLElement["removeEventListener"];
}

export const useEventHandler = (
  target: EventTarget,
  eventType: string,
  handler: React.EventHandler<any>,
  useCapture = false
) => {
  // Adapted from https://reactjs.org/docs/hooks-faq.html#what-can-i-do-if-my-effect-dependencies-change-too-often
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!target) return;

    const wrapper = (e) => handlerRef.current(e);
    target && target.addEventListener(eventType, wrapper, useCapture);

    return () => {
      target && target.removeEventListener(eventType, wrapper);
    };
  }, [target, eventType, useCapture]);
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

export const useHashChangeHandler = (handler) =>
  useEventHandler(window, "hashchange", handler);

export const useKeydownHandler = (handler: React.KeyboardEventHandler) =>
  useEventHandler(document.body, "keydown", handler);

export const useOutsideClick = (
  ref: React.MutableRefObject<HTMLElement | null>,
  handler: React.MouseEventHandler
) => {
  const handleOutsideClick = useCallback(
    (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        handler(event);
      }
    },
    [handler, ref]
  );

  useEventHandler(document, "mousedown", handleOutsideClick, true);
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
    const { x: leaderX, width: leaderWidth } =
      leaderRef.current.getBoundingClientRect();

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

export const useWindowSize = () => {
  const [windowSize, setWindowSize] = useState({
    width: 0,
    height: 0,
  });

  const handleResize = () => {
    // Set window width/height to state
    setWindowSize({
      width: window.innerWidth,
      height: window.innerHeight,
    });
  };

  useEventHandler(window, "resize", handleResize);

  useEffect(() => {
    handleResize();
  }, []);

  return windowSize;
};

export const useUnprocessedStateUpdate = (ignoreSpaces = false) => {
  const update = useStateUpdate(ignoreSpaces);
  return (resolve: StateResolver) => {
    update((t) => {
      const { colorscale, config, dataset, state } =
        resolve instanceof Function ? resolve(t) : resolve;

      return {
        colorscale,
        dataset: dataset
          ? (transformDataset(toCamelCase(dataset)) as State.Dataset)
          : null,
        config: config ? (toCamelCase(config) as State.Config) : undefined,
        state: state
          ? ({
              ...toCamelCase(state),
              view: state.view,
            } as State.Description)
          : null,
      };
    });
  };
};
