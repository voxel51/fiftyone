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
import React, { type ReactNode } from "react";
import { useTileTypes } from "../../lib/use-tile-state";
import { useTiling } from "../../lib/TilingProvider";
import { DefaultAddTileMenuItems } from "../AddTileMenu/DefaultAddTileMenuItems";
import { SidebarLeftIcon, SidebarRightIcon } from "./tiling-header-icons";
import styles from "./TilingHeader.module.css";

export interface TilingHeaderCaptionContext {
  readonly focusedTileId: string | null;
  readonly focusedTileTitle: string | null;
}

export type TilingHeaderCaption =
  | ReactNode
  | ((context: TilingHeaderCaptionContext) => ReactNode);

export interface TilingHeaderProps {
  fileName: string;
  headerCaption?: TilingHeaderCaption;
  /** Optional compact controls rendered beside the filename/caption stack. */
  headerActions?: ReactNode;
  /**
   * Custom content for the add-tile menu (use the voodo Menu*
   * primitives). Replaces the default kind-based items — hosts use this
   * to offer a source-first catalog. "Auto Layout" is always appended.
   */
  addTileMenu?: ReactNode;
  leftSidebarOpen?: boolean;
  rightSidebarOpen?: boolean;
  onToggleLeftSidebar?: () => void;
  onToggleRightSidebar?: () => void;
}

const TilingHeader: React.FC<TilingHeaderProps> = ({
  fileName,
  headerCaption,
  headerActions,
  addTileMenu,
  leftSidebarOpen,
  rightSidebarOpen,
  onToggleLeftSidebar,
  onToggleRightSidebar,
}) => {
  const types = useTileTypes();
  const { autoLayout, focusedTileId, resetLayout, tiles } = useTiling();
  const focusedTileTitle =
    focusedTileId && tiles[focusedTileId] ? tiles[focusedTileId].title : null;
  const caption =
    typeof headerCaption === "function"
      ? headerCaption({ focusedTileId, focusedTileTitle })
      : headerCaption;

  const hasTileMenu = addTileMenu != null || types.length > 0;
  const tileMenu = hasTileMenu ? (
    <>
      {addTileMenu ?? <DefaultAddTileMenuItems />}
      <MenuSeparator />
      <MenuIconTextItem
        icon={IconName.Refresh}
        text="Auto Layout"
        onClick={autoLayout}
      />
      <MenuIconTextItem
        icon={IconName.Undo}
        text="Reset Layout"
        onClick={resetLayout}
      />
    </>
  ) : null;

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
        {caption !== null && caption !== undefined ? (
          <div className={styles.caption}>{caption}</div>
        ) : null}
      </div>

      {headerActions ? (
        <div className={styles.headerActions}>{headerActions}</div>
      ) : null}

      <div className={styles.spacer} />

      <div className={styles.actions}>
        {tileMenu && (
          <div className={styles.dropdownSlot}>
            <Dropdown
              anchor={DropdownAnchor.BottomEnd}
              trigger={
                <Button
                  variant={Variant.Secondary}
                  size={Size.Xs}
                  data-testid="tiling-header-add-tile"
                  leadingIcon={IconName.GridView}
                  aria-label="Add Tile"
                  title="Add Tile"
                >
                  Add Tile
                </Button>
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
            leadingIcon={SidebarLeftIcon}
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
            leadingIcon={SidebarRightIcon}
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
