import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";

/** Matches the grid's tile animation, so tiles move with the sidebar. */
export const SLIDE_MS = 250;
const EASING = "cubic-bezier(0.2, 0, 0, 1)";
const GAP = 8;

type Phase = "open" | "opening" | "closing" | "closed";

const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Slides the sidebar in and out over the grid. The grid takes its new width
 * as the slide starts, so its tiles move to their places with the sidebar.
 */
export default function useSidebarSlide(show: boolean) {
  const [phase, setPhase] = useState<Phase>(show ? "open" : "closed");
  const [width, setWidth] = useState(0);
  const sidebar = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    setPhase((current) => {
      if (show) return current === "open" ? current : "opening";
      return current === "closed" ? current : "closing";
    });
  }, [show]);

  useLayoutEffect(() => {
    const el = sidebar.current;
    if (!el || (phase !== "opening" && phase !== "closing")) return undefined;
    // the grid makes room for the sidebar before it moves
    if (phase === "opening" && el.offsetWidth !== width) {
      setWidth(el.offsetWidth);
      return undefined;
    }

    const done = () => setPhase(phase === "opening" ? "open" : "closed");
    if (reduced() || typeof el.animate !== "function") {
      done();
      return undefined;
    }
    const away = {
      transform: `translateX(calc(-100% - ${GAP}px))`,
      opacity: 0,
    };
    const here = { transform: "translateX(0)", opacity: 1 };
    const animation = el.animate(
      phase === "opening" ? [away, here] : [here, away],
      { duration: SLIDE_MS, easing: EASING, fill: "both" },
    );
    animation.finished.then(done, () => undefined);
    return () => animation.cancel();
  }, [phase, width]);

  const moving = phase === "opening" || phase === "closing";
  const overlay: CSSProperties = {
    position: "absolute",
    top: 0,
    bottom: GAP,
    left: GAP,
    zIndex: 3,
  };

  return {
    rendered: phase !== "closed",
    sidebar,
    sidebarStyle: moving ? overlay : undefined,
    gridStyle: phase === "opening" ? { marginLeft: width + GAP } : undefined,
  };
}
