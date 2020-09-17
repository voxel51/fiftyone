import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export const useResizeHandler = (handler) => {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useLayoutEffect(() => {
    const wrapper = (e) => handlerRef.current(e);
    window.addEventListener("resize", wrapper);
    return () => {
      window.removeEventListener("resize", wrapper);
    };
  }, []);
};

export const useScrollHandler = (handler) => {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useLayoutEffect(() => {
    const wrapper = (e) => handlerRef.current(e);
    window.addEventListener("scroll", wrapper);
    return () => {
      window.removeEventListener("scroll", wrapper);
    };
  }, []);
};

export const useKeydownHandler = (handler) => {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const wrapper = (e) => handlerRef.current(e);
    document.body.addEventListener("keydown", wrapper);
    return () => {
      document.body.removeEventListener("keydown", wrapper);
    };
  }, []);
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
  const rerender = useCallback(() => {
    setCounter((prev) => prev + 1);
  }, []);
  return rerender;
};
