import { useTiling } from "@fiftyone/tiling";
import { MenuIconTextItem } from "@voxel51/voodo";
import React from "react";
import { TILE_TYPE, type TileType } from "../tiles/tile-types";
import { getTileDefinition } from "./tile-catalog";

/**
 * Archetype-first add-tile menu for the episode modal. Stream/source binding
 * happens inside each tile's settings; this menu only chooses the semantic
 * viewer the user wants to create.
 */
const AddTileMenu: React.FC<{
  readonly tileTypes: readonly TileType[];
}> = ({ tileTypes }) => {
  const { addTile } = useTiling();

  return (
    <>
      {tileTypes.map((type) => {
        const definition = getTileDefinition(type);
        if (!definition) return null;
        const Tile = definition.Tile;
        return (
          <MenuIconTextItem
            key={type}
            data-testid={`episode-add-tile-${type === TILE_TYPE.RAW ? "message" : type}`}
            icon={<definition.icon />}
            text={definition.typeLabel}
            onClick={() => {
              addTile(
                {
                  render: () => <Tile />,
                  title: definition.typeLabel,
                  type,
                },
                { idPrefix: type },
              );
            }}
          />
        );
      })}
    </>
  );
};

export default AddTileMenu;
