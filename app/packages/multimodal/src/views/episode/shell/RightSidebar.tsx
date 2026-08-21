import React from "react";
import InspectorSidebar from "../scene/picking/InspectorSidebar";
import EpisodeSidebarTabs from "../settings/controls/EpisodeSidebarTabs";
import FieldsSidebar from "./FieldsSidebar";

/**
 * MM right panel: "Inspect" / "Fields" tabs, through the same
 * `EpisodeSidebarTabs` shell the left sidebar (`SettingsSidebar`) uses, so
 * both stay visually and structurally identical.
 *
 * A bottom discussion tray (Teams-only, via an OSS extension seam) lands in
 * a follow-up PR once the Teams-side registration exists.
 */
const RightSidebar: React.FC = () => {
  return (
    <EpisodeSidebarTabs
      tabs={[
        {
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
