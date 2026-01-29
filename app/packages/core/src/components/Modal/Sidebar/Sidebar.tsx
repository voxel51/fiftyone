import {
  ANNOTATE,
  EXPLORE,
  modalMode,
  useModalExplorEntries,
} from "@fiftyone/state";
import { useAtomValue } from "jotai";
import React, { useCallback, useEffect, useState } from "react";
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

  // Track whether we've loaded schemas for this session
  const [schemasLoaded, setSchemasLoaded] = useState(false);

  const loadSchemas = useLoadSchemas();

  const handleSliceSelected = useCallback(() => {
    if (!schemasLoaded && showAnnotationTab && !disabledReason) {
      loadSchemas();
      setSchemasLoaded(true);
    }
  }, [schemasLoaded, showAnnotationTab, disabledReason, loadSchemas]);

  // This effect resets schemas loaded state when entering explore mode
  useEffect(() => {
    if (mode === EXPLORE) {
      setSchemasLoaded(false);
    }
  }, [mode]);

  const showSliceSelector =
    showAnnotationTab &&
    mode === ANNOTATE &&
    isGroupedDataset &&
    !disabledReason;

  return (
    <SidebarContainer modal={true}>
      {showAnnotationTab && <Mode />}
      {showSliceSelector && (
        <>
          <GroupModeTransitionManager />
          <AnnotationSliceSelector onSliceSelected={handleSliceSelected} />
        </>
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
