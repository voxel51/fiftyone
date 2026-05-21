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
import { useTileTypes } from "../../lib/use-tile-state";
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
 * - "Add tile" icon-button dropdown — one item per registered tile
 *   type. The spawned tile picks its own data binding (topic, stream,
 *   etc.); tiling doesn't know or care. Auto Layout is appended at
 *   the bottom.
 * - Two right-aligned sidebar toggles using mirrored "panel" icons that
 *   visually convey which side they control
 *
 * Must be rendered inside a `TilingProvider` — the menu depends on
 * tiling context for type discovery and tile spawning.
 */
const TilingHeader: React.FC<TilingHeaderProps> = ({
  fileName,
  leftSidebarOpen,
  rightSidebarOpen,
  onToggleLeftSidebar,
  onToggleRightSidebar,
}) => {
  const types = useTileTypes();
  const { addTile, autoLayout } = useTiling();

  const tileMenu = useMemo(() => {
    if (types.length === 0) return null;
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
                  { idPrefix: entry.type }
                );
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
    // addTile / autoLayout are stable callbacks from their providers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [types]);

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
                  data-testid="tiling-header-add-tile"
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
            data-testid="tiling-header-toggle-left-sidebar"
            // React 18/19 type mismatch on FC<{}>.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            leadingIcon={SidebarLeftIcon as any}
            aria-label={leftSidebarOpen ? "Hide settings" : "Show settings"}
            aria-pressed={!!leftSidebarOpen}
            title={leftSidebarOpen ? "Hide settings" : "Show settings"}
            onClick={onToggleLeftSidebar}
            className={clsx({ [styles.toggleActive]: leftSidebarOpen })}
          />
        )}

        {onToggleRightSidebar && (
          <Button
            variant={Variant.Borderless}
            size={Size.Xs}
            data-testid="tiling-header-toggle-right-sidebar"
            // React 18/19 type mismatch on FC<{}>.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            leadingIcon={SidebarRightIcon as any}
            aria-label={rightSidebarOpen ? "Hide inspector" : "Show inspector"}
            aria-pressed={!!rightSidebarOpen}
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
