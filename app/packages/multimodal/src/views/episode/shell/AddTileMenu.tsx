import { useTiling } from "@fiftyone/tiling";
import { MenuIconTextItem } from "@voxel51/voodo";
import React from "react";
import {
  EPISODE_TILE_TYPE,
  type EpisodeTileType,
} from "../tiles/episode-tile-types";
import { getEpisodeTileDefinition } from "./tile-catalog";

/**
 * Archetype-first add-tile menu for the episode modal. Stream/source binding
 * happens inside each tile's settings; this menu only chooses the semantic
 * viewer the user wants to create.
 */
const AddTileMenu: React.FC<{
  readonly tileTypes: readonly EpisodeTileType[];
}> = ({ tileTypes }) => {
  const { addTile } = useTiling();

  return (
    <>
      {tileTypes.map((type) => {
        const definition = getEpisodeTileDefinition(type);
        if (!definition) return null;
        const Tile = definition.Tile;
        return (
          <MenuIconTextItem
            key={type}
            data-testid={`episode-add-tile-${type === EPISODE_TILE_TYPE.RAW ? "message" : type}`}
            icon={definition.icon}
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
