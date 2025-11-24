import { useEffect, useRef } from "react";
import { useRecoilCallback, useRecoilState } from "recoil";
import * as fos from "@fiftyone/state";
import { getEntryKey } from "./utils";
import type { InteractiveItems } from "./types";

/**
 * Hook to handle programmatic scrolling to a specific field in the sidebar
 */
export default function useScrollToField({
  container,
  entries,
  items,
}: {
  container: React.RefObject<HTMLDivElement>;
  entries: fos.SidebarEntry[];
  items: React.MutableRefObject<InteractiveItems>;
}) {
  const [scrollTarget, setScrollTarget] = useRecoilState(
    fos.__unsafeSidebarScrollTarget(false)
  );
  const targetElementRef = useRef<HTMLElement | null>(null);

  const handleScrollRequest = useRecoilCallback(
    ({ set }) =>
      async () => {
        if (!scrollTarget?.path || !container.current) {
          return;
        }

        const scrollToElement = (element: HTMLElement) => {
          targetElementRef.current = element;

          // Always use instant scroll to avoid conflicts with RAF loop monitoring
          element.scrollIntoView({
            behavior: "smooth",
            block: "start",
            inline: "nearest",
          });

          // For normal scrolling, clear immediately since we use instant scroll
          if (!scrollTarget?.maintainPosition) {
            setScrollTarget(null);
            targetElementRef.current = null;
          }
        };

        // Find the entry for the target path
        const targetEntry = entries.find(
          (entry) =>
            entry.kind === fos.EntryKind.PATH &&
            entry.path === scrollTarget.path
        );

        if (!targetEntry) {
          // Path not found, clear the target
          setScrollTarget(null);
          return;
        }

        const targetKey = getEntryKey(targetEntry);
        const targetItem = items.current[targetKey];

        if (!targetItem?.el) {
          // Element not rendered yet, try again after next render
          requestAnimationFrame(() => {
            // Check again after animation frame
            const updatedItem = items.current[targetKey];
            if (updatedItem?.el) {
              scrollToElement(updatedItem.el);
            } else {
              // If still not available, clear the target
              setScrollTarget(null);
            }
          });
          return;
        }

        scrollToElement(targetItem.el);
      },
    [scrollTarget, entries, setScrollTarget]
  );

  useEffect(() => {
    handleScrollRequest();
  }, [handleScrollRequest]);

  // Watch for layout changes and maintain scroll position to target element
  // Only enabled when maintainPosition flag is set (e.g., for VAL panel)

  useEffect(() => {
    if (
      !scrollTarget?.path ||
      !scrollTarget?.maintainPosition ||
      !container.current ||
      !targetElementRef.current
    ) {
      return;
    }

    let rafId: number;
    let timeoutId: NodeJS.Timeout;

    const checkAndAdjustScroll = () => {
      if (!targetElementRef.current || !container.current) return;

      const element = targetElementRef.current;
      const elementRect = element.getBoundingClientRect();
      const containerRect = container.current.getBoundingClientRect();

      // Check if element is significantly out of position (moved by more than 50px)
      const elementTop = elementRect.top - containerRect.top;

      // If element is no longer near the top (where we scrolled it to), re-scroll
      if (Math.abs(elementTop) > 50) {
        element.scrollIntoView({
          behavior: "instant", // Use instant to avoid conflict with ongoing animations
          block: "start",
          inline: "nearest",
        });
      }

      // Continue watching for a few seconds
      rafId = requestAnimationFrame(checkAndAdjustScroll);
    };

    // Start watching after initial scroll completes
    rafId = requestAnimationFrame(checkAndAdjustScroll);

    // Clear after 3 seconds (VAL panel multiple layout changes side effects)
    timeoutId = setTimeout(() => {
      cancelAnimationFrame(rafId);
      setScrollTarget(null);
      targetElementRef.current = null;
    }, 3000);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
    };
  }, [scrollTarget, setScrollTarget]);
}
