import { SidebarPanel } from "@fiftyone/tiling";
import { Size, ToggleSwitch, ToggleSwitchVariant } from "@voxel51/voodo";
import React from "react";
import InspectorSidebar from "../scene/picking/InspectorSidebar";
import FieldsSidebar from "./FieldsSidebar";
import styles from "./RightSidebar.module.css";

/**
 * MM right panel: "Inspect" / "Fields" tabs (voodo `ToggleSwitch`).
 *
 * A bottom discussion tray (Teams-only, via an OSS extension seam) lands in
 * a follow-up PR once the Teams-side registration exists.
 */
const RightSidebar: React.FC = () => {
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
                    <InspectorSidebarBody />
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
                      <FieldsSidebar />
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

// `InspectorSidebar` already renders its own `SidebarPanel` shell, so it
// slots directly into the "Inspect" tab body without a wrapper.
const InspectorSidebarBody: React.FC = () => <InspectorSidebar />;

export default RightSidebar;
