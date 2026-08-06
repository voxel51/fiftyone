import { SidebarPanel } from "@fiftyone/tiling";
import { Size, ToggleSwitch, ToggleSwitchVariant } from "@voxel51/voodo";
import React from "react";
import McapFieldsSidebar from "./McapFieldsSidebar";
import McapInspectorSidebar from "./McapInspectorSidebar";
import styles from "./McapRightSidebar.module.css";

/**
 * MM right panel: "Inspect" / "Fields" tabs (voodo `ToggleSwitch`).
 *
 * A bottom discussion tray (Teams-only, via an OSS extension seam) lands in
 * a follow-up PR once the Teams-side registration exists.
 */
const McapRightSidebar: React.FC = () => {
  return (
    <div className={styles.root}>
      <div className={styles.tabs}>
        <ToggleSwitch
          size={Size.Sm}
          variant={ToggleSwitchVariant.Soft}
          tabListClassName={styles.tabList}
          fullWidth
          tabs={[
            {
              id: "inspect",
              data: {
                label: "Inspect",
                content: (
                  <div className={styles.tabPanel}>
                    <McapInspectorSidebarBody />
                  </div>
                ),
              },
            },
            {
              id: "fields",
              data: {
                label: "Fields",
                content: (
                  <div className={styles.tabPanel}>
                    <SidebarPanel title="Fields">
                      <McapFieldsSidebar />
                    </SidebarPanel>
                  </div>
                ),
              },
            },
          ]}
        />
      </div>
    </div>
  );
};

// `McapInspectorSidebar` already renders its own `SidebarPanel` shell, so it
// slots directly into the "Inspect" tab body without a wrapper.
const McapInspectorSidebarBody: React.FC = () => <McapInspectorSidebar />;

export default McapRightSidebar;
