import { useTiling, useTileTypes } from "@fiftyone/tiling";
import { MenuIconTextItem } from "@voxel51/voodo";
import { useMemo } from "react";

/**
 * Layout menu for the group sample view: one item per built-in kind that is
 * not already on the canvas. Built-in group content is a singleton per kind
 * (two media tiles would mount two lookers on the same sample), so present
 * kinds are left out rather than duplicated.
 */
export const GroupAddTileMenu = () => {
  const types = useTileTypes();
  const { addTile, tiles } = useTiling();
  const present = useMemo(
    () => new Set(Object.values(tiles).map((tile) => tile.type)),
    [tiles],
  );
  const missing = types.filter((entry) => !present.has(entry.type));

  return (
    <>
      {missing.map((entry) => {
        const TileComponent = entry.Tile;
        return (
          <MenuIconTextItem
            key={entry.type}
            icon={entry.icon}
            text={entry.typeLabel}
            onClick={() => {
              addTile(
                {
                  render: () => <TileComponent />,
                  title: entry.typeLabel,
                  type: entry.type,
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
