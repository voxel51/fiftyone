import { type CSSProperties, useEffect, useRef, useState } from "react";

export const SLIDE_MS = 200;
const GAP = 8;
const EASE = `${SLIDE_MS}ms cubic-bezier(0.2, 0, 0, 1)`;

type Phase = "open" | "closing" | "closed" | "enter" | "entering";

const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Slides the sidebar out and in. While it moves, the grid keeps its width
 * and slides with it, so the grid relays out once, when the slide ends.
 */
export default function useSidebarSlide(show: boolean) {
  const [phase, setPhase] = useState<Phase>(show ? "open" : "closed");
  const sidebar = useRef<HTMLDivElement>(null);
  const width = useRef(0);

  useEffect(() => {
    if (reduced()) {
      setPhase(show ? "open" : "closed");
      return undefined;
    }
    if (!show) {
      width.current = sidebar.current?.offsetWidth ?? width.current;
      setPhase((current) => (current === "closed" ? current : "closing"));
      const done = setTimeout(() => setPhase("closed"), SLIDE_MS);
      return () => clearTimeout(done);
    }

    setPhase((current) => (current === "open" ? current : "enter"));
    let done: ReturnType<typeof setTimeout>;
    // one frame at the start position, so the slide has somewhere to come from
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        width.current = sidebar.current?.offsetWidth ?? width.current;
        setPhase((current) => (current === "enter" ? "entering" : current));
        done = setTimeout(
          () =>
            setPhase((current) => (current === "entering" ? "open" : current)),
          SLIDE_MS,
        );
      }),
    );
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(done);
    };
  }, [show]);

  const shift = width.current + GAP;
  const away = `translateX(calc(-100% - ${GAP}px))`;
  const overlay: CSSProperties = {
    position: "absolute",
    top: 0,
    bottom: GAP,
    left: GAP,
    zIndex: 2,
  };

  const styles: Record<Phase, { grid?: CSSProperties; side?: CSSProperties }> =
    {
      open: {},
      closed: {},
      closing: {
        side: { transform: away, opacity: 0, transition: `all ${EASE}` },
        grid: {
          transform: `translateX(-${shift}px)`,
          transition: `transform ${EASE}`,
        },
      },
      enter: { side: { ...overlay, transform: away, opacity: 0 } },
      entering: {
        side: { ...overlay, transition: `all ${EASE}` },
        grid: {
          transform: `translateX(${shift}px)`,
          transition: `transform ${EASE}`,
        },
      },
    };

  return {
    rendered: phase !== "closed",
    sidebar,
    sidebarStyle: styles[phase].side,
    gridStyle: styles[phase].grid,
  };
}
