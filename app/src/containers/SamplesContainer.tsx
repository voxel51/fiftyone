import React, { useEffect } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import styled from "styled-components";

import FieldsSidebar from "../components/FieldsSidebar";
import ContainerHeader from "../components/ImageContainerHeader";
import Samples from "../components/Samples";
import ViewBar from "../components/ViewBar/ViewBar";
import { scrollbarStyles } from "../components/utils";

import { labelFilters } from "../components/Filters/LabelFieldFilters.state";
import * as labelAtoms from "../components/Filters/utils";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";

const SidebarColumn = styled.div`
  ${scrollbarStyles}
  z-index: 400;
  max-height: 100%;
  overflow-y: scroll;
  overflow-x: hidden;
  width 256px;
`;

const ContentColumn = styled.div`
  flex-grow: 1;
  width: 1px; // flex-related?, unset width causes the sidebar to collapse
`;
const Container = styled.div`
  display: flex;
  justify-content: space-between;
  margin-right: -1rem;
  flex-grow: 1;
  overflow: hidden;
`;

const SamplesContainer = React.memo(() => {
  const [showSidebar, setShowSidebar] = useRecoilState(atoms.sidebarVisible);

  return (
    <>
      <ViewBar />
      <ContainerHeader
        showSidebar={showSidebar}
        onShowSidebar={setShowSidebar}
      />
      <Container>
        {showSidebar ? (
          <SidebarColumn>
            <FieldsSidebar
              modal={false}
              style={{
                scrollbarWidth: "thin",
              }}
            />
          </SidebarColumn>
        ) : null}
        <ContentColumn>
          <Samples />
        </ContentColumn>
      </Container>
    </>
  );
});

export default SamplesContainer;
