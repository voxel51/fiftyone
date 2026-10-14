import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { fitCardHeight, type TrayItem } from "./cardSizing";
import { CARD_HEIGHT, MULTIMODAL_CARD_HEIGHT } from "./theme";

const CardHeightContext = createContext<number | null>(null);

export function useSelectionCardHeight() {
  return useContext(CardHeightContext);
}

/** Fits the visible cards, including folds, in either the tray or a bucket. */
export default function SelectionCards({
  children,
  className,
  label,
  multimodal = false,
}: {
  children: ReactNode;
  className: string;
  label: string;
  multimodal?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(
    multimodal ? MULTIMODAL_CARD_HEIGHT : CARD_HEIGHT,
  );

  // Observe the card area's content box and the visible cards' source ratios.
  // Ratios can arrive after images load; reading direct children preserves
  // their actual flex order, including the fold between the head and tail.
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return undefined;
    const padding = getComputedStyle(element);
    const pixels = (value: string) => parseFloat(value) || 0;
    let width =
      element.clientWidth -
      pixels(padding.paddingLeft) -
      pixels(padding.paddingRight);
    let availableHeight =
      element.clientHeight -
      pixels(padding.paddingTop) -
      pixels(padding.paddingBottom);
    const fit = () => {
      const items = Array.from(element.children).flatMap<TrayItem>((child) => {
        if (child.hasAttribute("data-tray-fold")) return [{ fold: true }];
        const ratio = child.getAttribute("data-tray-aspect-ratio");
        return ratio === null ? [] : [{ aspectRatio: Number(ratio) || null }];
      });
      setHeight(fitCardHeight(items, width, availableHeight, multimodal));
    };
    const resize = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width;
      availableHeight = entry.contentRect.height;
      fit();
    });
    const cards = new MutationObserver((records) => {
      if (
        records.some(
          (record) => record.type === "attributes" || record.target === element,
        )
      )
        fit();
    });
    resize.observe(element);
    cards.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-tray-aspect-ratio", "data-tray-fold"],
    });
    fit();
    return () => {
      resize.disconnect();
      cards.disconnect();
    };
  }, [multimodal]);

  return (
    <div
      ref={root}
      role="group"
      className={className}
      aria-label={label}
      style={{ "--tray-card-h": `${height}px` } as CSSProperties}
    >
      <CardHeightContext.Provider value={height}>
        {children}
      </CardHeightContext.Provider>
    </div>
  );
}
