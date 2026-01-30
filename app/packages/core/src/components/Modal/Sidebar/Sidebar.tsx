import {
  ANNOTATE,
  EXPLORE,
  modalMode,
  useModalExplorEntries,
} from "@fiftyone/state";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import ExploreSidebar from "../../Sidebar";
import SidebarContainer from "../../Sidebar/SidebarContainer";
import Annotate from "./Annotate";
import { AnnotationSliceSelector } from "./Annotate/AnnotationSliceSelector";
import { GroupModeTransitionManager } from "./Annotate/GroupModeTransitionManager";
import useCanAnnotate from "./Annotate/useCanAnnotate";
import useLoadSchemas from "./Annotate/useLoadSchemas";
import Mode from "./Mode";
import { useModalSidebarRenderEntry } from "./use-sidebar-render-entry";

const Explore = () => {
  const renderEntry = useModalSidebarRenderEntry();

  return (
    <ExploreSidebar
      isDisabled={() => false}
      render={renderEntry}
      useEntries={useModalExplorEntries}
      modal={true}
    />
  );
};

const Sidebar = () => {
  const mode = useAtomValue(modalMode);
  const { showAnnotationTab, disabledReason, isGroupedDataset } =
    useCanAnnotate();

  const loadSchemas = useLoadSchemas();

  // This effect loads schemas on init for valid annotation sessions
  useEffect(() => {
    if (showAnnotationTab && !disabledReason) {
      loadSchemas();
    }
  }, [showAnnotationTab, disabledReason, loadSchemas]);

  const showSliceSelector =
    showAnnotationTab &&
    mode === ANNOTATE &&
    isGroupedDataset &&
    !disabledReason;

  const showTransitionManager =
    showAnnotationTab && isGroupedDataset && !disabledReason;

  return (
    <SidebarContainer modal={true}>
      {showAnnotationTab && <Mode />}
      {showTransitionManager && <GroupModeTransitionManager />}
      {showSliceSelector && (
        <AnnotationSliceSelector onSliceSelected={loadSchemas} />
      )}
      {mode === EXPLORE || !showAnnotationTab ? (
        <Explore />
      ) : (
        <Annotate disabledReason={disabledReason} />
      )}
    </SidebarContainer>
  );
};

export default Sidebar;
