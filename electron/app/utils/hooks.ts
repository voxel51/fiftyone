import { useState, useEffect, useLayoutEffect } from "react";

export const useResizeHandler = (handler, deps = []) => {
  useEffect(() => {
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("resize", handler);
    };
  }, deps);
};

export const useScrollHandler = (handler, deps = []) => {
  useEffect(() => {
    window.addEventListener("scroll", handler);
    return () => {
      window.removeEventListener("scroll", handler);
    };
  }, deps);
};

export const useKeydownHandler = (handler, deps = []) => {
  useEffect(() => {
    document.body.addEventListener("keydown", handler);
    return () => {
      document.body.removeEventListener("keydown", handler);
    };
  }, deps);
};

export const useOutsideClick = (ref, callback) => {
  useEffect(() => {
    function handleClickOutside(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        callback(event);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [ref, callback]);
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
  return () => {
    setCounter((prev) => prev + 1);
  };
};
