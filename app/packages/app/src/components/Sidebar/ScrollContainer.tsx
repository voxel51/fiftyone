import React, {
  useLayoutEffect,
  useCallback,
  useRef,
  useState,
  useEffect,
} from "react";
import ResizeObserver from "resize-observer-polyfill";

const ScrollContainer = ({ children, scrollIntertia }) => {
  const [{ y }, set] = useSpring(() => ({
    y: [0],
    config: {
      mass: 1,
      tension: 200,
      friction: scrollIntertia,
      precision: 0.00001,
      velocity: 0,
      clamp: true,
    },
  }));

  const viewportRef = useRef(null);
  const [currentHeight, setCurrentHeight] = useState(window.innerHeight);

  const getCurrentHeight = useCallback((entries) => {
    for (let entry of entries) {
      const crx = entry.contentRect;
      setCurrentHeight(crx.height);
    }
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let ro = new ResizeObserver((entries) => getCurrentHeight(entries));
    ro.observe(viewport);
    return () => {
      if (!ro) return;
      ro.disconnect();
    };
  }, [getCurrentHeight]);

  useEffect(() => {
    const handleScroll = () => set({ y: [-window.pageYOffset] });
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [set]);

  return (
    <>
      <a.div
        style={{ transform: y.interpolate((y) => `translate3d(0,${y}px,0)`) }}
        ref={viewportRef}
        className="scroll-container"
      >
        {children}
      </a.div>
      <div style={{ height: currentHeight }} />
    </>
  );
};

export default ScrollContainer;
