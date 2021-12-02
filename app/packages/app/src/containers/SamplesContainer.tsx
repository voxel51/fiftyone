import React from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { Controller } from "@react-spring/web";
import styled from "styled-components";

import FieldsSidebar, {
  EntryKind,
  sidebarEntries,
  SidebarEntry,
} from "../components/Sidebar/Sidebar";
import ContainerHeader from "../components/ImageContainerHeader";
import Flashlight from "../components/Flashlight";
import ViewBar from "../components/ViewBar/ViewBar";

import * as atoms from "../recoil/atoms";
import { elementNames } from "../recoil/view";
import { TextEntry } from "../components/Sidebar/Entries";

const SidebarContainer = styled.div`
  display: block;
  height: 100%;
  width 286px;
  overflow: visible;
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
  const { singular } = useRecoilValue(elementNames);

  const renderGridEntry = (
    group: string,
    entry: SidebarEntry,
    controller: Controller
  ) => {
    switch (entry.kind) {
      case EntryKind.PATH:
        return {
          children: (
            <FilterEntry
              modal={false}
              path={entry.path}
              group={group}
              onFocus={() => {
                controller.set({ zIndex: "1" });
              }}
              onBlur={() => {
                controller.set({ zIndex: "0" });
              }}
            />
          ),
          disabled: false,
        };
      case EntryKind.GROUP:
        return {
          children: <InteractiveGroupEntry name={entry.name} modal={false} />,
          disabled: false,
        };
      case EntryKind.TAIL:
        return {
          children: <AddGridGroup />,
          disabled: true,
        };
      case EntryKind.EMPTY:
        return {
          children: (
            <TextEntry
              text={group === "tags" ? `No ${singular} tags` : "No fields"}
            />
          ),
          disabled: true,
        };
      default:
        throw new Error("invalid entry");
    }
  };

  return (
    <>
      <ViewBar key={"bar"} />
      <ContainerHeader
        showSidebar={showSidebar}
        onShowSidebar={setShowSidebar}
        key={"header"}
      />
      <Container>
        {showSidebar && (
          <SidebarContainer>
            <FieldsSidebar
              entriesAtom={sidebarEntries(false)}
              render={renderGridEntry}
            />
          </SidebarContainer>
        )}
        <ContentColumn style={{ paddingLeft: showSidebar ? 0 : "1rem" }}>
          <Flashlight />
        </ContentColumn>
      </Container>
    </>
  );
});

export default SamplesContainer;
