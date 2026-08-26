import React from "react";
import InspectorSidebar from "../scene/picking/InspectorSidebar";
import EpisodeSidebarTabs from "../settings/controls/EpisodeSidebarTabs";
import { useStateActionSchemaIfPresent } from "../state-action/state-action-context";
import StateActionStatisticsSidebar from "../state-action/StateActionStatisticsSidebar";
import FieldsSidebar from "./FieldsSidebar";

/**
 * MM right panel, through the same `EpisodeSidebarTabs` shell the left
 * sidebar (`SettingsSidebar`) uses, so both stay visually and structurally
 * identical.
 *
 * The first tab is format-aware: state/action sessions (LeRobot) have no
 * pickable objects, so they get a "Statistics" tab of dataset-declared
 * per-dimension facts instead of the object "Inspect" tab MCAP keeps.
 *
 * A bottom discussion tray (Teams-only, via an OSS extension seam) lands in
 * a follow-up PR once the Teams-side registration exists.
 */
const RightSidebar: React.FC = () => {
  const stateActionSchema = useStateActionSchemaIfPresent();
  return (
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
  );
};

export default RightSidebar;
