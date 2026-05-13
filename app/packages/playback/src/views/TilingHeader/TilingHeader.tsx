import {
  Button,
  Dropdown,
  DropdownAnchor,
  IconName,
  MenuIconTextItem,
  MenuSeparator,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import clsx from "clsx";
import { useAtomValue, useStore } from "jotai";
import React, { useMemo } from "react";
import { registeredTilesAtom, tileSourceAtom } from "../../lib/playback/atoms";
import { useTileKinds } from "../../lib/playback/use-tile-state";
import { useTiling } from "../../lib/TilingProvider";
import { SidebarLeftIcon, SidebarRightIcon } from "./tiling-header-icons";
import styles from "./TilingHeader.module.css";

export interface TilingHeaderProps {
  /** Displayed on the left — usually the current dataset / session filename. */
  fileName: string;
  /** Current left sidebar visibility. Toggle button reflects this in its label. */
  leftSidebarOpen?: boolean;
  /** Current right sidebar visibility. */
  rightSidebarOpen?: boolean;
  onToggleLeftSidebar?: () => void;
  onToggleRightSidebar?: () => void;
}

/**
 * Top-of-page chrome for a tiling layout:
 *
 * - Filename on the left (truncates with ellipsis when narrow)
 * - "Add tile" icon-button dropdown — items are inferred from the
 *   distinct tile *kinds* among streams registered with the engine.
 *   Spawning a Camera tile binds it to the first registered camera
 *   stream by default; the user can swap to any other registered
 *   camera through the tile's settings panel. Auto Layout is
 *   appended at the bottom.
 * - Two right-aligned sidebar toggles using mirrored "panel" icons that
 *   visually convey which side they control
 *
 * Must be rendered inside a `PlaybackProvider` and a `TilingProvider`
 * — the menu depends on both for stream discovery and tile spawning.
 */
const TilingHeader: React.FC<TilingHeaderProps> = ({
  fileName,
  leftSidebarOpen,
  rightSidebarOpen,
  onToggleLeftSidebar,
  onToggleRightSidebar,
}) => {
  const kinds = useTileKinds();
  const allTiles = useAtomValue(registeredTilesAtom);
  const { addTile, autoLayout } = useTiling();
  const store = useStore();

  const tileMenu = useMemo(() => {
    if (kinds.length === 0) return null;
    return (
      <>
        {kinds.map(({ tile }) => {
          const TileComponent = tile.Tile;
          return (
            <MenuIconTextItem
              key={tile.kind}
              icon={tile.icon}
              text={tile.kindLabel}
              onClick={() => {
                const newTileId = addTile(
                  {
                    title: tile.kindLabel,
                    render: () => <TileComponent />,
                  },
                  { idPrefix: tile.kind }
                );
                // Default the spawn to the first registered source of
                // this kind, if any. The user can swap via the settings
                // sidebar's source picker.
                const firstSource = allTiles.find(
                  (t) => t.tile.kind === tile.kind
                );
                if (firstSource) {
                  store.set(tileSourceAtom(newTileId), firstSource.id);
                }
              }}
            />
          );
        })}
        <MenuSeparator />
        <MenuIconTextItem
          icon={IconName.Refresh}
          text="Auto Layout"
          onClick={autoLayout}
        />
      </>
    );
  }, [kinds, allTiles, addTile, autoLayout, store]);

  return (
    <div className={styles.root}>
      <div className={styles.fileName}>
        <Text
          variant={TextVariant.Sm}
          color={TextColor.Primary}
          className={styles.fileNameText}
        >
          {fileName}
        </Text>
      </div>

      <div className={styles.spacer} />

      <div className={styles.actions}>
        {tileMenu && (
          <div className={styles.dropdownSlot}>
            <Dropdown
              anchor={DropdownAnchor.BottomEnd}
              trigger={
                <Button
                  variant={Variant.Borderless}
                  size={Size.Xs}
                  leadingIcon={IconName.GridView}
                  aria-label="Add tile"
                  title="Add tile"
                />
              }
            >
              {tileMenu}
            </Dropdown>
          </div>
        )}

        {onToggleLeftSidebar && (
          <Button
            variant={Variant.Borderless}
            size={Size.Xs}
            // React 18/19 type mismatch on FC<{}>.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            leadingIcon={SidebarLeftIcon as any}
            aria-label={leftSidebarOpen ? "Hide settings" : "Show settings"}
            title={leftSidebarOpen ? "Hide settings" : "Show settings"}
            onClick={onToggleLeftSidebar}
            className={clsx({ [styles.toggleActive]: leftSidebarOpen })}
          />
        )}

        {onToggleRightSidebar && (
          <Button
            variant={Variant.Borderless}
            size={Size.Xs}
            // React 18/19 type mismatch on FC<{}>.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            leadingIcon={SidebarRightIcon as any}
            aria-label={rightSidebarOpen ? "Hide inspector" : "Show inspector"}
            title={rightSidebarOpen ? "Hide inspector" : "Show inspector"}
            onClick={onToggleRightSidebar}
            className={clsx({ [styles.toggleActive]: rightSidebarOpen })}
          />
        )}
      </div>
    </div>
  );
};

export default TilingHeader;
