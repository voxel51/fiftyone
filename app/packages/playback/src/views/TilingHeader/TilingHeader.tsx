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
import React, { useMemo } from "react";
import { useRegisteredTiles } from "../../lib/playback/use-registered-tiles";
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
 *   streams that declared `PlaybackStream.tile` and are currently
 *   registered with the engine. The header asks
 *   `useRegisteredTiles()` for the list, so the menu stays in lockstep
 *   with what data has been registered without any per-story wiring.
 *   Auto Layout is appended at the bottom.
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
  const registeredTiles = useRegisteredTiles();
  const { addTile, autoLayout } = useTiling();

  const tileMenu = useMemo(() => {
    if (registeredTiles.length === 0) return null;
    return (
      <>
        {registeredTiles.map(({ id, tile }) => {
          const TileComponent = tile.Tile;
          return (
            <MenuIconTextItem
              key={id}
              icon={tile.icon}
              text={tile.title}
              onClick={() =>
                addTile(
                  {
                    title: tile.title,
                    render: () => <TileComponent />,
                  },
                  { idPrefix: id }
                )
              }
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
  }, [registeredTiles, addTile, autoLayout]);

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
