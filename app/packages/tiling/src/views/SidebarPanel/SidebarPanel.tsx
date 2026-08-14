import { Divider, Heading, HeadingLevel } from "@voxel51/voodo";
import React, { type ReactNode } from "react";
import styles from "./SidebarPanel.module.css";

export interface SidebarPanelProps {
  /**
   * Section title shown at the top of the panel. Omit when the panel is
   * already nested under a tab (or other chrome) that names it, so the
   * name isn't shown twice.
   */
  title?: ReactNode;
  children: ReactNode;
}

/**
 * Consistent shell for a Drawer-hosted sidebar panel: title row, a
 * horizontal divider underneath, then the body content. Both the
 * TileSettingsSidebar and TilingInspectorSidebar render through this so
 * their chrome stays in lockstep.
 *
 * Heading uses `HeadingLevel.H4` (Md, normal weight) so it reads as a
 * section header rather than a page title
 */
const SidebarPanel: React.FC<SidebarPanelProps> = ({ title, children }) => {
  return (
    <div className={styles.root}>
      {title ? (
        <>
          <div className={styles.header}>
            <Heading level={HeadingLevel.H4}>{title}</Heading>
          </div>
          <Divider />
        </>
      ) : null}
      <div className={styles.body}>{children}</div>
    </div>
  );
};

export default SidebarPanel;
