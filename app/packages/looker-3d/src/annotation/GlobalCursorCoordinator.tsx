import { useCallback, useEffect } from "react";
import { useSetRecoilState } from "recoil";
import { PANEL_IDS, getPanelElementId } from "../constants";
import { activeCursorPanelAtom } from "../state";
import type { PanelId } from "../types";

/**
 * Determines which panel the cursor is currently over by checking DOM elements.
 * Returns the PanelId if the cursor is over a panel, null otherwise.
 */
function getPanelUnderCursor(clientX: number, clientY: number): PanelId | null {
  const element = document.elementFromPoint(clientX, clientY);
  if (!element) return null;

  // Walk up the DOM tree to find a panel container
  let current: Element | null = element;
  while (current) {
    const id = current.id;
    for (const panelId of PANEL_IDS) {
      if (id === getPanelElementId(panelId)) {
        return panelId;
      }
    }
    current = current.parentElement;
  }

  return null;
}

interface GlobalCursorCoordinatorProps {
  containerRef: React.RefObject<HTMLElement>;
}

/**
 * GlobalCursorCoordinator - Single component that determines which panel has the cursor.
 *
 * @param containerRef - Reference to the container element (MultiPanelView's GridMain)
 */
export const GlobalCursorCoordinator = ({
  containerRef,
}: GlobalCursorCoordinatorProps) => {
  const setActiveCursorPanel = useSetRecoilState(activeCursorPanelAtom);

  const handlePointerMove = useCallback((ev: PointerEvent) => {
    const panelId = getPanelUnderCursor(ev.clientX, ev.clientY);
    setActiveCursorPanel(panelId);
  }, []);

  const handlePointerLeave = useCallback(() => {
    setActiveCursorPanel(null);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    container.addEventListener("pointerleave", handlePointerLeave, {
      passive: true,
    });

    return () => {
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [containerRef, handlePointerMove, handlePointerLeave]);

  return null;
};
