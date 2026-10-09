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
import {
  createExploreIsDisabled,
  Sidebar as ExploreSidebar,
  FieldActionContext,
  SidebarContainer,
} from "@fiftyone/sidebar";
import Annotate from "./Annotate";
import useCanAnnotate from "./Annotate/useCanAnnotate";
import useLoadSchemas from "./Annotate/useLoadSchemas";
import Mode from "./Mode";
import SchemaLensRow from "../../SchemaLens/SchemaLensRow";
import { QuickEditEntry } from "./Annotate";
import { useModalSidebarRenderEntry } from "./use-sidebar-render-entry";

const Explore = () => {
  const renderEntry = useModalSidebarRenderEntry();
  const disabled = useDisabledCheckboxPaths();

  return (
    <FieldActionContext.Provider value={QuickEditEntry}>
      <ExploreSidebar
        isDisabled={createExploreIsDisabled(disabled)}
        render={renderEntry}
        useEntries={useModalExplorEntries}
        modal={true}
      />
    </FieldActionContext.Provider>
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
      <SchemaLensRow />
      {mode === EXPLORE || !showAnnotationTab ? (
        <Explore />
      ) : (
        <Annotate disabledReason={disabledReason} loadSchemas={loadSchemas} />
      )}
    </SidebarContainer>
  );
};

export default Sidebar;
