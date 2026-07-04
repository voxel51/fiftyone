import { MenuIconTextItem } from "@voxel51/voodo";
import React from "react";
import { useTiling } from "../../lib/TilingProvider";
import { useTileTypes } from "../../lib/use-tile-state";

/**
 * The kind-based add-tile menu: one item per registered tile kind
 * (Image, 3D, …). This is the fallback content for every add-tile entry
 * point (`TilingHeader`, `TilingZeroState`) when the host doesn't
 * provide a richer `addTileMenu` — e.g. a source-first menu that lists
 * the actual streams instead of abstract kinds.
 */
export const DefaultAddTileMenuItems: React.FC = () => {
  const types = useTileTypes();
  const { addTile } = useTiling();

  return (
    <>
      {types.map((entry) => {
        const TileComponent = entry.Tile;
        return (
          <MenuIconTextItem
            key={entry.type}
            icon={entry.icon}
            text={entry.typeLabel}
            onClick={() => {
              addTile(
                {
                  title: entry.typeLabel,
                  render: () => <TileComponent />,
                },
                { idPrefix: entry.type },
              );
            }}
          />
        );
      })}
    </>
  );
};
