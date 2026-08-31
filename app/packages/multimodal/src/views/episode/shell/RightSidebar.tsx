import React, { type ReactNode } from "react";
import InspectorSidebar from "../scene/picking/InspectorSidebar";
import EpisodeSidebarTabs from "../settings/controls/EpisodeSidebarTabs";
import { useStateActionSchemaIfPresent } from "../state-action/state-action-context";
import StateActionStatisticsSidebar from "../state-action/StateActionStatisticsSidebar";
import FieldsSidebar from "./FieldsSidebar";
import styles from "./RightSidebar.module.css";

export interface RightSidebarProps {
  /**
   * Rendered below the tab shell as a sibling rather than inside a tab, so it
   * stays put while the user switches between Inspect and Fields. Omitted by a
   * surface that hosts no trays.
   */
  readonly tray?: ReactNode;
}

/**
 * MM right panel, through the same `EpisodeSidebarTabs` shell the left
 * sidebar (`SettingsSidebar`) uses, so both stay visually and structurally
 * identical.
 *
 * The first tab is format-aware: state/action sessions (LeRobot) have no
 * pickable objects, so they get a "Statistics" tab of dataset-declared
 * per-dimension facts instead of the object "Inspect" tab MCAP keeps.
 *
 * This is the plain surface. {@link RightSidebarWithTrays} adds registered
 * trays; a host that shouldn't have them uses this directly.
 */
const RightSidebar: React.FC<RightSidebarProps> = ({ tray }) => {
  const stateActionSchema = useStateActionSchemaIfPresent();
  return (
    <div className={styles.root}>
      <div className={styles.tabs}>
        <EpisodeSidebarTabs
          remountKey={stateActionSchema ? "statistics" : "inspect"}
          tabs={[
            stateActionSchema
              ? {
                  id: "statistics",
                  data: {
                    label: "Statistics",
                    content: <StateActionStatisticsSidebar />,
                  },
                }
              : {
                  id: "inspect",
                  data: { label: "Inspect", content: <InspectorSidebar /> },
                },
            {
              id: "fields",
              data: { label: "Fields", content: <FieldsSidebar /> },
            },
          ]}
        />
      </div>
      {tray && <div className={styles.tray}>{tray}</div>}
    </div>
  );
};

export default RightSidebar;
