import {
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import ResizeObserver from "resize-observer-polyfill";
import { useSetRecoilState } from "recoil";

import { mainSize, mainTop, mousePosition } from "./atoms";

export const useTrackMousePosition = () => {
  let timeout;
  const setMousePosition = useSetRecoilState(mousePosition);

  const updateMousePosition = (event) => {
    if (timeout) {
      window.cancelAnimationFrame(timeout);
    }
    timeout = window.requestAnimationFrame(() => {
      setMousePosition([event.clientX, event.clientY]);
    });
  };

  useEffect(() => {
    window.addEventListener("mousemove", updateMousePosition);

    return () => window.removeEventListener("mousemove", updateMousePosition);
  }, []);
};

export const useResizeObserver = () => {
  const [entry, setEntry] = useState({});
  const [node, setNode] = useState(null);
  const observer = useRef(null);

  const disconnect = useCallback(() => {
    const { current } = observer;
    current && current.disconnect();
  }, []);

  const observe = useCallback(() => {
    observer.current = new ResizeObserver(([entry]) => setEntry(entry));
    node && observer.current.observe(node);
  }, [node]);

  useLayoutEffect(() => {
    observe();
    return () => disconnect();
  }, [disconnect, observe]);

  return [setNode, entry];
};
