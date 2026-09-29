import {
  EXPLORE,
  datasetName,
  modalMode,
  useDisabledCheckboxPaths,
  useModalExplorEntries,
} from "@fiftyone/state";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { useReverbValue } from "@fiftyone/reverb";
import ExploreSidebar from "../../Sidebar";
import { createExploreIsDisabled } from "../../Sidebar/InteractiveSidebar";
import SidebarContainer from "../../Sidebar/SidebarContainer";
import Annotate from "./Annotate";
import useCanAnnotate from "./Annotate/useCanAnnotate";
import useLoadSchemas from "./Annotate/useLoadSchemas";
import Mode from "./Mode";
import { useModalSidebarRenderEntry } from "./use-sidebar-render-entry";

const Explore = () => {
  const renderEntry = useModalSidebarRenderEntry();
  const disabled = useDisabledCheckboxPaths();

  return (
    <ExploreSidebar
      isDisabled={createExploreIsDisabled(disabled)}
      render={renderEntry}
      useEntries={useModalExplorEntries}
      modal={true}
    />
  );
};

const Sidebar = () => {
  const mode = useAtomValue(modalMode);
  const { showAnnotationTab, disabledReason } = useCanAnnotate();
  const datasetNameValue = useReverbValue(datasetName);

  const loadSchemas = useLoadSchemas();

  // This effect loads schemas on init for valid annotation sessions
  useEffect(() => {
    if (datasetNameValue && showAnnotationTab && !disabledReason) {
      // Only load schemas if annotation is fully enabled (no disabled reason)
      // Also reload when dataset changes
      loadSchemas();
    }
  }, [showAnnotationTab, disabledReason, loadSchemas, datasetNameValue]);

  return (
    <SidebarContainer modal={true}>
      {showAnnotationTab && <Mode />}
      {mode === EXPLORE || !showAnnotationTab ? (
        <Explore />
      ) : (
        <Annotate disabledReason={disabledReason} loadSchemas={loadSchemas} />
      )}
    </SidebarContainer>
  );
};

export default Sidebar;
