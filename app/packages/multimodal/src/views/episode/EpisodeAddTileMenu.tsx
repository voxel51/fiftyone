import { useTiling } from "@fiftyone/tiling";
import { MenuIconTextItem } from "@voxel51/voodo";
import React from "react";
import { EPISODE_TILE_TYPE, type EpisodeTileType } from "./episode-tile-types";
import { getEpisodeTileDefinition } from "./use-episode-tiles";

const EPISODE_ADD_TILE_TYPES: readonly EpisodeTileType[] = [
  EPISODE_TILE_TYPE.IMAGE,
  EPISODE_TILE_TYPE.THREE_D,
  EPISODE_TILE_TYPE.MAP,
  EPISODE_TILE_TYPE.LOG,
  EPISODE_TILE_TYPE.PLOT,
  EPISODE_TILE_TYPE.RAW,
];

/**
 * Archetype-first add-tile menu for the episode modal. Stream/source binding
 * happens inside each panel's settings; this menu only chooses the kind
 * of panel the user wants to create.
 */
const EpisodeAddTileMenu: React.FC = () => {
  const { addTile } = useTiling();

  return (
    <>
      {EPISODE_ADD_TILE_TYPES.map((type) => {
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

export default EpisodeAddTileMenu;
