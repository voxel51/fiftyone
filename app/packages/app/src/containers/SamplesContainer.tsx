import React from "react";
import { useRecoilState } from "recoil";
import styled from "styled-components";

import FieldsSidebar from "../components/FieldsSidebar";
import ContainerHeader from "../components/ImageContainerHeader";
import Samples from "../components/Samples";
import ViewBar from "../components/ViewBar/ViewBar";
import { scrollbarStyles } from "../components/utils";

import * as atoms from "../recoil/atoms";

const SidebarContainer = styled.div`
  display: block;
  height: 100%;
  width 270px;
`;

const SidebarColumn = styled.div`
  ${scrollbarStyles}
  z-index: 400;
  max-height: 100%;
  height: 100%;
  overflow-y: scroll;
  overflow-x: hidden;
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
      <ViewBar key={"bar"} />
      <ContainerHeader
        showSidebar={showSidebar}
        onShowSidebar={setShowSidebar}
        key={"header"}
      />
      <Container>
        {showSidebar ? (
          <SidebarContainer>
            <SidebarColumn>
              <FieldsSidebar
                modal={false}
                style={{
                  scrollbarWidth: "thin",
                }}
              />
            </SidebarColumn>
          </SidebarContainer>
        ) : null}
        <ContentColumn>
          <Samples />
        </ContentColumn>
      </Container>
    </>
  );
});

export default SamplesContainer;
