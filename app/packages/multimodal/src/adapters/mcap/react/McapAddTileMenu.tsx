import { useTiling } from "@fiftyone/tiling";
import { MenuIconTextItem } from "@voxel51/voodo";
import React from "react";
import { MCAP_TILE_TYPE, type McapTileType } from "./mcap-tile-types";
import { getMcapTileDefinition } from "./use-mcap-tiles";

const MCAP_ADD_TILE_TYPES: readonly McapTileType[] = [
  MCAP_TILE_TYPE.IMAGE,
  MCAP_TILE_TYPE.THREE_D,
  MCAP_TILE_TYPE.PLOT,
  MCAP_TILE_TYPE.RAW,
];

/**
 * Archetype-first add-tile menu for the MCAP modal. Topic/source binding
 * happens inside each panel's settings; this menu only chooses the kind
 * of panel the user wants to create.
 */
const McapAddTileMenu: React.FC = () => {
  const { addTile } = useTiling();

  return (
    <>
      {MCAP_ADD_TILE_TYPES.map((type) => {
        const definition = getMcapTileDefinition(type);
        if (!definition) return null;
        const Tile = definition.Tile;
        return (
          <MenuIconTextItem
            key={type}
            data-testid={`mcap-add-tile-${type === MCAP_TILE_TYPE.RAW ? "message" : type}`}
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

export default McapAddTileMenu;
