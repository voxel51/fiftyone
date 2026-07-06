import { useTiling } from "@fiftyone/tiling";
import { MenuCheckItem, MenuSectionTitle, MenuTextItem } from "@voxel51/voodo";
import React, { useMemo } from "react";
import { useSceneInventory } from "../../../scene-inventory";
import { mcapTileTypeFromId } from "./mcap-layout-persistence";
import { MCAP_TILE_TYPE } from "./mcap-tile-types";
import { useMcapImageTileBindings } from "./mcap-tile-source-bindings";
import { orderImageSourcesForManualSelection } from "./playback-layout";
import { useOpenMcapImageTile } from "./use-open-mcap-image-tile";
import { getMcapTileDefinition, mcapTileTypesFor } from "./use-mcap-tiles";

/**
 * Source-first add-tile menu for the MCAP modal: instead of abstract
 * tile kinds ("Image", "3D"), it lists what the recording actually
 * contains — the fused 3D scene and each camera stream by name, with
 * default-preferred downsampled/compressed equivalents before raw siblings.
 * Streams already on screen are checked; clicking one focuses
 * its tile instead of duplicating it (an intentional second view of a
 * stream is one "Duplicate" away), while unchecked entries spawn a tile
 * bound to that source.
 *
 * Rendered inside the tiling shell's add-tile dropdowns (header and
 * zero state) via `MultiModalPlayback`'s `addTileMenu` prop.
 */
const McapAddTileMenu: React.FC = () => {
  const sources = useSceneInventory();
  const { addTile, setFocusedTileId, tiles } = useTiling();
  const bindings = useMcapImageTileBindings();

  const rankedImages = useMemo(
    () => orderImageSourcesForManualSelection(sources),
    [sources],
  );
  const has3d = useMemo(
    () =>
      mcapTileTypesFor(
        Array.from(new Set(sources.map((source) => source.type))),
      ).includes(MCAP_TILE_TYPE.THREE_D),
    [sources],
  );
  const open3dTileId = useMemo(
    () =>
      Object.keys(tiles).find(
        (tileId) => mcapTileTypeFromId(tileId) === MCAP_TILE_TYPE.THREE_D,
      ) ?? null,
    [tiles],
  );

  const open3dTile = () => {
    if (open3dTileId) {
      setFocusedTileId(open3dTileId);
      return;
    }
    const definition = getMcapTileDefinition(MCAP_TILE_TYPE.THREE_D);
    if (!definition) return;
    const Tile = definition.Tile;
    addTile(
      { title: definition.typeLabel, render: () => <Tile /> },
      { idPrefix: MCAP_TILE_TYPE.THREE_D },
    );
  };

  const openImageTile = useOpenMcapImageTile();

  // Unlike the 3D scene, plots are additive by design — comparing two
  // field sets side by side is the point — so this entry always spawns
  // a fresh tile instead of focusing an open one.
  const openPlotTile = () => spawnTile(MCAP_TILE_TYPE.PLOT);
  // Raw message tiles are additive for the same reason: one tile per
  // inspected topic.
  const openRawTile = () => spawnTile(MCAP_TILE_TYPE.RAW);

  const spawnTile = (type: string) => {
    const definition = getMcapTileDefinition(type);
    if (!definition) return;
    const Tile = definition.Tile;
    addTile(
      { title: definition.typeLabel, render: () => <Tile /> },
      { idPrefix: type },
    );
  };

  const displayedSourceIds = useMemo(
    () => new Set(Object.values(bindings)),
    [bindings],
  );

  return (
    <>
      {has3d ? (
        <MenuCheckItem
          checked={open3dTileId !== null}
          data-cy="mcap-add-tile-3d"
          onClick={open3dTile}
        >
          3D scene
        </MenuCheckItem>
      ) : null}
      <MenuTextItem data-cy="mcap-add-tile-plot" onClick={openPlotTile}>
        Plot
      </MenuTextItem>
      <MenuTextItem data-cy="mcap-add-tile-raw" onClick={openRawTile}>
        Raw messages
      </MenuTextItem>
      {rankedImages.length > 0 ? (
        <>
          <MenuSectionTitle>Image streams</MenuSectionTitle>
          {rankedImages.map((source) => (
            <MenuCheckItem
              key={source.id}
              checked={displayedSourceIds.has(source.id)}
              data-cy={`mcap-add-tile-source-${source.id}`}
              onClick={() => openImageTile(source.id)}
            >
              {source.label}
            </MenuCheckItem>
          ))}
        </>
      ) : null}
    </>
  );
};

export default McapAddTileMenu;
