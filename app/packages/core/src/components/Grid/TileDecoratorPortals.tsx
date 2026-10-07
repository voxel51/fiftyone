/**
 * Mounts registered tile decorators into each visible grid tile via
 * React portals.
 *
 * Lives at the Grid component level (sibling of the Spotlight host
 * div) — one React tree to manage all decorators across all tiles
 * instead of a per-tile `createRoot`. The portal target on each tile
 * is the `overlayEl` reserved by `useRenderer.showItem` (an absolute-
 * positioned div above the looker host, `pointer-events: none`).
 *
 * The component renders `null` itself; portals do the actual UI.
 */

import React from "react";
import { createPortal } from "react-dom";
import { useGridTiles } from "./gridTileRegistry";
import { useTileDecorators } from "./tileDecorators";

const TileDecoratorPortals: React.FC = () => {
  const tiles = useGridTiles();
  const decorators = useTileDecorators();

  // Short-circuit when nothing is registered. Avoids the (cheap, but
  // still measurable) per-tile fragment render in browse mode where
  // no decorators exist.
  if (decorators.length === 0) return null;

  return (
    <>
      {tiles.map((tile) =>
        // `createPortal`'s 3rd arg keys the portal at the parent level
        // (it's how React 18 differentiates portals to the same DOM
        // container); no inner Fragment-key indirection needed.
        createPortal(
          decorators.map((d) => (
            <React.Fragment key={d.id}>{d.render(tile.sample)}</React.Fragment>
          )),
          tile.overlayEl,
          tile.id,
        ),
      )}
    </>
  );
};

export default React.memo(TileDecoratorPortals);
