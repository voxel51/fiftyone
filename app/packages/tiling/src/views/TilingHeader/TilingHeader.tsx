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
import React, { useMemo, type ReactNode } from "react";
import { useTileTypes } from "../../lib/use-tile-state";
import { useTiling } from "../../lib/TilingProvider";
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
  leftSidebarOpen?: boolean;
  rightSidebarOpen?: boolean;
  onToggleLeftSidebar?: () => void;
  onToggleRightSidebar?: () => void;
}

const TilingHeader: React.FC<TilingHeaderProps> = ({
  fileName,
  headerCaption,
  leftSidebarOpen,
  rightSidebarOpen,
  onToggleLeftSidebar,
  onToggleRightSidebar,
}) => {
  const types = useTileTypes();
  const { addTile, autoLayout, focusedTileId, tiles } = useTiling();
  const focusedTileTitle =
    focusedTileId && tiles[focusedTileId] ? tiles[focusedTileId].title : null;
  const caption =
    typeof headerCaption === "function"
      ? headerCaption({ focusedTileId, focusedTileTitle })
      : headerCaption;

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
  }, [types, addTile, autoLayout]);

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
        {caption ? <div className={styles.caption}>{caption}</div> : null}
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
