import { Anchor, Tooltip, type TooltipProps } from "@voxel51/voodo";
import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import styles from "./SelectionTray.module.css";

const VIEWPORT_PADDING = 8;
const ANCHOR_GAP = 8;

/** Positions VOODO's mounted panel within the viewport, keeping its arrow aligned. */
function TooltipContent({
  triggerId,
  children,
}: {
  triggerId: string;
  children: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  // This effect keeps the open panel and arrow aligned as their sizes change.
  useLayoutEffect(() => {
    // VOODO exposes neither a panel ref nor collision handling. Measuring from
    // the content also works when its panel is portaled out of the tray.
    const panel = content.current?.closest<HTMLElement>(`.${styles.tooltip}`);
    const trigger = document.getElementById(triggerId);
    if (!panel || !trigger) return undefined;
    const position = () => {
      const rect = trigger.getBoundingClientRect();
      const width = panel.getBoundingClientRect().width;
      const center = rect.left + rect.width / 2;
      const centeredLeft = center - width / 2;
      const left = Math.max(
        VIEWPORT_PADDING,
        Math.min(window.innerWidth - VIEWPORT_PADDING - width, centeredLeft),
      );
      panel.style.left = `${center}px`;
      panel.style.top = `${rect.top - ANCHOR_GAP}px`;
      panel.style.setProperty(
        "--tray-tooltip-offset",
        `${left - centeredLeft}px`,
      );
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(panel);
    observer.observe(trigger);
    window.addEventListener("resize", position);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
    };
  }, [triggerId]);
  return <div ref={content}>{children}</div>;
}

/** Shared tooltip for tray controls, cards, and action panels. */
export default function SelectionTooltip({
  content,
  ...props
}: Pick<TooltipProps, "content" | "children" | "wrapperClassName">) {
  const triggerId = useId();
  return (
    <Tooltip
      {...props}
      id={triggerId}
      anchor={Anchor.Top}
      portal
      className={styles.tooltip}
      content={<TooltipContent triggerId={triggerId}>{content}</TooltipContent>}
    />
  );
}
