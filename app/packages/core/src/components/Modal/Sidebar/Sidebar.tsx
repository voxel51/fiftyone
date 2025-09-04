import { EXPLORE, modalMode, useModalExplorEntries } from "@fiftyone/state";
import { useAtomValue } from "jotai";
import React, { useEffect } from "react";
import ExploreSidebar from "../../Sidebar";
import SidebarContainer from "../../Sidebar/SidebarContainer";
import Annotate from "./Annotate";
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
    />
  );
};

const Sidebar = () => {
  const mode = useAtomValue(modalMode);

  const loadSchemas = useLoadSchemas();
  useEffect(() => {
    loadSchemas();
  }, [loadSchemas]);

  return (
    <SidebarContainer modal={true}>
      <Mode />
      {mode === EXPLORE ? <Explore /> : <Annotate />}
    </SidebarContainer>
  );
};

export default Sidebar;
