import { useEffect } from "react";
import {
  isPointerInTileSelectionRegion,
  setHoveredTile,
  tileIdAt,
} from "./gridTileRegistry";

/**
 * Publishes which grid tile the pointer is over, resolved through the tile
 * registry from delegated events on the Spotlight host. Spotlight owns the
 * tile elements, so listeners live on the host rather than on tiles.
 */
export default function useTileHover(id: string) {
  // This effect delegates pointer tracking to the grid host because tiles are
  // created and recycled outside React.
  useEffect(() => {
    const host = document.getElementById(id);
    if (!host) return undefined;
    const onOver = (event: PointerEvent) => {
      const tileId = tileIdAt(event.target);
      setHoveredTile(
        tileId,
        isPointerInTileSelectionRegion(tileId, event.clientY),
      );
    };
    const onLeave = () => setHoveredTile(null);
    host.addEventListener("pointerover", onOver, true);
    host.addEventListener("pointermove", onOver, true);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      host.removeEventListener("pointerover", onOver, true);
      host.removeEventListener("pointermove", onOver, true);
      host.removeEventListener("pointerleave", onLeave);
      setHoveredTile(null);
    };
  }, [id]);
}
