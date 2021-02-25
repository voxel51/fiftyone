import React from "react";
import { useRecoilState } from "recoil";
import { Checkbox } from "@material-ui/core";
import styled from "styled-components";

import FieldsSidebar from "../components/FieldsSidebar";
import ContainerHeader from "../components/ImageContainerHeader";
import Samples from "../components/Samples";
import ViewBar from "../components/ViewBar/ViewBar";
import { scrollbarStyles } from "../components/utils";
import { useTheme } from "../utils/hooks";

import * as atoms from "../recoil/atoms";

const SidebarContainer = styled.div`
  display: grid;
  height: 100%;
  grid-template-rows: 1fr 4rem;
  width 256px;
`;

const SidebarColumn = styled.div`
  ${scrollbarStyles}
  z-index: 400;
  max-height: 100%;
  overflow-y: scroll;
  overflow-x: hidden;
`;

const SidebarFooter = styled.div`
  width: 100%;
  padding: 0.5rem 1.5rem 0.5rem 0.5rem;
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

const OptionContainer = styled.div`
  display: flex;
  justify-content: space-between;
  background: ${({ theme }) => theme.backgroundDark};
  box-shadow: 0 8px 15px 0 rgba(0, 0, 0, 0.43);
  border: 1px solid #191c1f;
  border-radius: 2px;
  color: ${({ theme }) => theme.fontDark};
  margin-top: 0.25rem;
  font-weight: bold;
  cursor: pointer;
`;

const OptionButton = styled.div`
  display: flex;
  justify-content: space-between;
  background: ${({ theme }) => theme.backgroundDark};
  box-shadow: 0 8px 15px 0 rgba(0, 0, 0, 0.43);
  border: 1px solid #191c1f;
  border-radius: 2px;
  color: ${({ theme }) => theme.fontDark};
  margin-top: 0.25rem;
  font-weight: bold;
`;

const SamplesContainer = React.memo(() => {
  const [showSidebar, setShowSidebar] = useRecoilState(atoms.sidebarVisible);
  const [colorByLabel, setColorByLabel] = useRecoilState(atoms.colorByLabel);
  const theme = useTheme();

  return (
    <>
      <ViewBar />
      <ContainerHeader
        showSidebar={showSidebar}
        onShowSidebar={setShowSidebar}
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
            <SidebarFooter>
              <OptionContainer onClick={() => setColorByLabel(!colorByLabel)}>
                <span style={{ height: "2rem", padding: "0.5rem" }}>
                  Color by label
                </span>
                <Checkbox
                  style={{ color: theme.brand }}
                  checked={colorByLabel}
                />
              </OptionContainer>
            </SidebarFooter>
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
