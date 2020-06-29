import _ from "lodash";
import {
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import ResizeObserver from "resize-observer-polyfill";
import { useSetRecoilState } from "recoil";

import { mousePosition } from "./atoms";

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

  const observe = useCallback(
    _.debounce(() => {
      observer.current = new ResizeObserver(([entry]) => setEntry(entry));
      node && observer.current.observe(node);
    }, 500),
    [node]
  );

  useLayoutEffect(() => {
    observe();
    return () => disconnect();
  }, [disconnect, observe]);

  return [setNode, entry];
};

export const useScroll = () => {
  const [bodyOffset, setBodyOffset] = useState<DOMRect | ClientRect>(
    document.body.getBoundingClientRect()
  );
  const [scrollY, setScrollY] = useState<number>(bodyOffset.top);
  const [scrollX, setScrollX] = useState<number>(bodyOffset.left);
  const [scrollDirection, setScrollDirection] = useState<"up" | "down">();

  const lastScrollTopRef = useRef(0);
  const lastScrollTop = lastScrollTopRef.current;
  const listener = () => {
    setBodyOffset(document.body.getBoundingClientRect());
    setScrollY(-bodyOffset.top);
    setScrollX(bodyOffset.left);
    setScrollDirection(lastScrollTop > -bodyOffset.top ? "down" : "up");
    lastScrollTopRef.current = -bodyOffset.top;
  };

  const delay = 200;

  useEffect(() => {
    window.addEventListener("scroll", debounce(listener, delay));
    return () => window.removeEventListener("scroll", listener);
  });

  return {
    scrollY,
    scrollX,
    scrollDirection,
  };
};
