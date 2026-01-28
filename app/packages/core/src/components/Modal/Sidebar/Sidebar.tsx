import * as fos from "@fiftyone/state";
import { EXPLORE, modalMode, useModalExplorEntries } from "@fiftyone/state";
import { useAtomValue } from "jotai";
import React, { useEffect } from "react";
import { useRecoilValue } from "recoil";
import ExploreSidebar from "../../Sidebar";
import SidebarContainer from "../../Sidebar/SidebarContainer";
import Annotate from "./Annotate";
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
  const { showAnnotationTab, disabledReason } = useCanAnnotate();
  const datasetName = useRecoilValue(fos.datasetName);

  const loadSchemas = useLoadSchemas();
  useEffect(() => {
    // Only load schemas if annotation is fully enabled (no disabled reason)
    // Also reload when dataset changes
    showAnnotationTab && !disabledReason && loadSchemas();
  }, [showAnnotationTab, disabledReason, loadSchemas, datasetName]);

  return (
    <SidebarContainer modal={true}>
      {showAnnotationTab && <Mode />}
      {mode === EXPLORE || !showAnnotationTab ? (
        <Explore />
      ) : (
        <Annotate disabledReason={disabledReason} />
      )}
    </SidebarContainer>
  );
};

export default Sidebar;
