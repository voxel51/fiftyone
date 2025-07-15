import { useEffect, useState } from "react";
import { LIGHTER_EVENTS, Scene2D } from "../index";

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function useSceneSelectionState(scene: Scene2D | null) {
  const [selectedOverlayIds, setSelectedOverlayIds] = useState<string[]>([]);
  const [selectedBounds, setSelectedBounds] = useState<Bounds | null>(null);

  useEffect(() => {
    if (!scene) return;

    const eventBus = scene.getEventBus();

    const handleSelectionChanged = (event: Event) => {
      const selectedIds = scene.getSelectedOverlayIds();
      setSelectedOverlayIds(selectedIds);

      // Update selected bounds for the first selected bounding box
      if (selectedIds.length > 0) {
        const firstSelected = scene.getOverlay(selectedIds[0]);
        if (firstSelected && "getBounds" in firstSelected) {
          const bounds = (firstSelected as any).getBounds();
          setSelectedBounds(bounds);
        } else {
          setSelectedBounds(null);
        }
      } else {
        setSelectedBounds(null);
      }
    };

    eventBus.addEventListener(
      LIGHTER_EVENTS.SELECTION_CHANGED,
      handleSelectionChanged
    );
    eventBus.addEventListener(
      LIGHTER_EVENTS.SELECTION_CLEARED,
      handleSelectionChanged
    );

    return () => {
      eventBus.removeEventListener(
        LIGHTER_EVENTS.SELECTION_CHANGED,
        handleSelectionChanged
      );
      eventBus.removeEventListener(
        LIGHTER_EVENTS.SELECTION_CLEARED,
        handleSelectionChanged
      );
    };
  }, [scene]);

  return { selectedOverlayIds, selectedBounds };
}
