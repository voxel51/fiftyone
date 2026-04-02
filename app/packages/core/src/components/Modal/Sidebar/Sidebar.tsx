import {
  activeFields,
  ANNOTATE,
  EXPLORE,
  datasetName,
  modalMode,
  useModalExplorEntries,
} from "@fiftyone/state";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { useRecoilValue } from "recoil";
import { setExploreActiveFields as setExploreActiveFieldsAction } from "./Annotate/redux/annotationSlice";
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
  const datasetNameValue = useRecoilValue(datasetName);
  const exploreFields = useRecoilValue(
    activeFields({ modal: true, expanded: false })
  );
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(setExploreActiveFieldsAction(exploreFields));
    return () => {
      dispatch(setExploreActiveFieldsAction(null));
    };
  }, [exploreFields, dispatch]);

  const loadSchemas = useLoadSchemas();

  // This effect loads schemas on init for valid annotation sessions
  useEffect(() => {
    if (showAnnotationTab && !disabledReason) {
      // Only load schemas if annotation is fully enabled (no disabled reason)
      // Also reload when dataset changes
      loadSchemas();
    }
  }, [showAnnotationTab, disabledReason, loadSchemas, datasetNameValue]);

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
