import { OPERATOR_PROMPT_AREAS, OperatorPromptArea } from "@fiftyone/operators";
import { PANEL_AREA, PanelArea } from "@fiftyone/spaces";
import * as fos from "@fiftyone/state";
import { constants } from "@fiftyone/utilities";
import React from "react";
import { useReverbValue } from "@fiftyone/reverb";
import styled from "styled-components";
import MainSpace from "./MainSpace";

const { IS_APP_MODE_FIFTYONE } = constants;

const Container = styled.div`
  display: flex;
  justify-content: space-between;
  flex-grow: 1;
  overflow: hidden;
  background: ${({ theme }) => theme.background.header};
`;

function SamplesContainer() {
  const isModalOpen = useReverbValue(fos.isModalActive);

  return (
    <Container>
      {!isModalOpen && (
        <OperatorPromptArea area={OPERATOR_PROMPT_AREAS.DRAWER_LEFT} />
      )}
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
