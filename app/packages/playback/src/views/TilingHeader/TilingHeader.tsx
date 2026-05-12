import {
  Button,
  Dropdown,
  DropdownAnchor,
  IconName,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import clsx from "clsx";
import React, { type ReactNode } from "react";
import { SidebarLeftIcon, SidebarRightIcon } from "./tiling-header-icons";
import styles from "./TilingHeader.module.css";

export interface TilingHeaderProps {
  /** Displayed on the left — usually the current dataset / session filename. */
  fileName: string;
  /**
   * Menu items rendered inside the "add tile" dropdown. Pass voodo
   * `MenuIconTextItem` / `MenuSeparator` children so callers can wire
   * their own tile kinds + layout actions. The header just owns the
   * dropdown chrome.
   */
  tileMenu?: ReactNode;
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
 * - "Add tile" icon-button dropdown — content controlled by the caller
 *   via `tileMenu` so the header doesn't need to know the app's tile
 *   kinds
 * - Two right-aligned sidebar toggles using mirrored "panel" icons that
 *   visually convey which side they control
 *
 * Used by the demo stories (MultiModalDemo, BlockingStreamDemo) as the
 * shell's top row, sitting above the Mosaic grid and timeline.
 */
const TilingHeader: React.FC<TilingHeaderProps> = ({
  fileName,
  tileMenu,
  leftSidebarOpen,
  rightSidebarOpen,
  onToggleLeftSidebar,
  onToggleRightSidebar,
}) => {
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
