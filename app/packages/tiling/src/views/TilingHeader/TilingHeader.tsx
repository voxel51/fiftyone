import {
  Button,
  Dropdown,
  DropdownAnchor,
  GridViewIcon,
  MenuIconTextItem,
  MenuSeparator,
  RefreshIcon,
  Size,
  Text,
  TextColor,
  TextVariant,
  UndoIcon,
  Variant,
} from "@voxel51/voodo";
import clsx from "clsx";
import React, { type ReactNode } from "react";
import { useTileTypes } from "../../lib/use-tile-state";
import { useTiling } from "../../lib/TilingProvider";
import { DefaultAddTileMenuItems } from "../AddTileMenu/DefaultAddTileMenuItems";
import {
  SidebarBottomIcon,
  SidebarLeftIcon,
  SidebarRightIcon,
} from "./tiling-header-icons";
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
  /** Optional compact controls rendered immediately before the layout menu. */
  headerActions?: ReactNode;
  /**
   * Custom content for the add-tile menu (use the voodo Menu*
   * primitives). Replaces the default kind-based items — hosts use this
   * to offer a source-first catalog. "Auto Layout" is always appended.
   */
  addTileMenu?: ReactNode;
  leftSidebarOpen?: boolean;
  /** Whether the bottom timeline tracks drawer is open. */
  timelineTracksOpen?: boolean;
  rightSidebarOpen?: boolean;
  onToggleLeftSidebar?: () => void;
  /** Toggles the bottom timeline tracks drawer. */
  onToggleTimelineTracks?: () => void;
  onToggleRightSidebar?: () => void;
}

const TilingHeader: React.FC<TilingHeaderProps> = ({
  fileName,
  headerCaption,
  headerActions,
  addTileMenu,
  leftSidebarOpen,
  timelineTracksOpen,
  rightSidebarOpen,
  onToggleLeftSidebar,
  onToggleTimelineTracks,
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
        icon={<RefreshIcon />}
        text="Auto Layout"
        onClick={autoLayout}
      />
      <MenuIconTextItem
        icon={<UndoIcon />}
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

      <div className={styles.spacer} />

      <div className={styles.actions}>
        {headerActions ? (
          <div className={styles.headerActions}>{headerActions}</div>
        ) : null}

        {tileMenu && (
          <div className={styles.dropdownSlot}>
            <Dropdown
              anchor={DropdownAnchor.BottomEnd}
              trigger={
                <Button
                  variant={Variant.Secondary}
                  size={Size.Xs}
                  data-testid="tiling-header-add-tile"
                  leadingIcon={GridViewIcon}
                  aria-label="Layout"
                  title="Layout"
                >
                  Layout
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

        {onToggleTimelineTracks && (
          <Button
            variant={Variant.Borderless}
            size={Size.Xs}
            data-testid="tiling-header-toggle-timeline-tracks"
            leadingIcon={SidebarBottomIcon}
            aria-label={
              timelineTracksOpen
                ? "Hide timeline tracks"
                : "Show timeline tracks"
            }
            aria-pressed={!!timelineTracksOpen}
            title={
              timelineTracksOpen
                ? "Hide timeline tracks"
                : "Show timeline tracks"
            }
            onClick={onToggleTimelineTracks}
            className={clsx({ [styles.toggleActive]: timelineTracksOpen })}
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
