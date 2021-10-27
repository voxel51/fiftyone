import React from "react";
import { useRecoilState } from "recoil";
import styled from "styled-components";

import FieldsSidebar from "../components/Sidebar/Sidebar";
import ContainerHeader from "../components/ImageContainerHeader";
import Flashlight from "../components/Flashlight";
import ViewBar from "../components/ViewBar/ViewBar";
import { scrollbarStyles } from "../components/utils";

import * as atoms from "../recoil/atoms";

const SidebarContainer = styled.div`
  display: block;
  height: 100%;
  width 286px;
  padding-left: 1rem;
  overflow: visible;
`;

const SidebarColumn = styled.div`
  max-height: 100%;
  height: 100%;
  overflow-y: scroll;
  overflow-x: hidden;
  scrollbar-color: ${({ theme }) => theme.fontDarkest}
    ${({ theme }) => theme.background};

  ${scrollbarStyles}
`;

const ContentColumn = styled.div`
  flex-grow: 1;
  width: 1px;
`;
const Container = styled.div`
  display: flex;
  justify-content: space-between;
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
              <FieldsSidebar modal={false} />
            </SidebarColumn>
          </SidebarContainer>
        ) : null}
        <ContentColumn style={{ paddingLeft: showSidebar ? 0 : "1rem" }}>
          <Flashlight />
        </ContentColumn>
      </Container>
    </>
  );
});

export default SamplesContainer;
