import { OPERATOR_PROMPT_AREAS, OperatorPromptArea } from "@fiftyone/operators";
import { PANEL_AREA, PanelArea } from "@fiftyone/spaces";
import * as fos from "@fiftyone/state";
import { useReverbValue, useSetReverbState } from "@fiftyone/reverb";
import { FieldActionContext, GridSidebar } from "@fiftyone/sidebar";
import { constants } from "@fiftyone/utilities";
import {
  CloseIcon,
  getColorCssVar,
  IconAction,
  Size,
  TextColor,
} from "@voxel51/voodo";
import React from "react";
import styled from "styled-components";
import MainSpace from "./MainSpace";
import { QuickEditEntry } from "./Modal/Sidebar/Annotate";
import SchemaLensRow from "./SchemaLens/SchemaLensRow";

const { IS_APP_MODE_FIFTYONE } = constants;

const Container = styled.div`
  display: flex;
  justify-content: space-between;
  flex-grow: 1;
  overflow: hidden;
  background: var(--color-content-bg-background);
`;

const SidebarArea = styled.div`
  display: flex;
  min-height: 0;
  padding: 8px 0 8px 8px;
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;

  & > [data-cy="schema-lens-row"] {
    flex: 1;
    min-width: 0;
  }

  & > [data-cy="sidebar-close"] {
    margin-left: auto;
  }
`;

const Sidebar = () => {
  const setShowSidebar = useSetReverbState(fos.sidebarVisible(false));

  return (
    <SidebarArea>
      <FieldActionContext.Provider value={QuickEditEntry}>
        <GridSidebar
          header={
            <HeaderRow>
              <SchemaLensRow padded={false} />
              <IconAction
                aria-label="Hide sidebar"
                data-cy="sidebar-close"
                icon={CloseIcon}
                size={Size.Sm}
                title="Hide sidebar"
                style={{ color: getColorCssVar(TextColor.Secondary) }}
                onClick={() => setShowSidebar(false)}
              />
            </HeaderRow>
          }
        />
      </FieldActionContext.Provider>
    </SidebarArea>
  );
};

function SamplesContainer() {
  const showSidebar = useReverbValue(fos.sidebarVisible(false));
  const isModalOpen = useReverbValue(fos.isModalActive);

  return (
    <Container>
      {!isModalOpen && (
        <OperatorPromptArea area={OPERATOR_PROMPT_AREAS.DRAWER_LEFT} />
      )}
      {showSidebar && <Sidebar />}
      <MainSpace />
      {!isModalOpen && (
        <OperatorPromptArea area={OPERATOR_PROMPT_AREAS.DRAWER_RIGHT} />
      )}
      {IS_APP_MODE_FIFTYONE && (
        <PanelArea
          id={PANEL_AREA.GRID_SIDEBAR_RIGHT}
          resize={{ direction: "left" }}
        />
      )}
    </Container>
  );
}

export default React.memo(SamplesContainer);
