import React, { Suspense } from "react";
import { useRecoilState } from "recoil";
import { Controller } from "@react-spring/web";
import styled from "styled-components";

import FieldsSidebar, {
  EntryKind,
  Entries,
  SidebarEntry,
  useTagText,
  useEntries,
} from "../components/Sidebar";
import ContainerHeader from "../components/ImageContainerHeader";
import Flashlight from "../components/Flashlight";
import ViewBar from "../components/ViewBar/ViewBar";

import * as atoms from "../recoil/atoms";
import { State } from "../recoil/types";

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
  const tagText = useTagText();
  const [entries, setEntries] = useEntries(false);

  const renderGridEntry = (
    group: string,
    entry: SidebarEntry,
    controller: Controller,
    dragging: boolean
  ) => {
    switch (entry.kind) {
      case EntryKind.PATH:
        const isTag = entry.path.startsWith("tags.");
        const isLabelTag = entry.path.startsWith("_label_tags.");

        return {
          children:
            isTag || isLabelTag ? (
              <Entries.FilterableTag
                modal={false}
                tagKey={isLabelTag ? State.TagKey.LABEL : State.TagKey.SAMPLE}
                tag={entry.path.split(".").slice(1).join(".")}
              />
            ) : (
              <Entries.FilterablePath
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
          disabled: isTag || isLabelTag,
        };
      case EntryKind.GROUP:
        const isTags = entry.name === "tags";
        const isLabelTags = entry.name === "label tags";

        return {
          children:
            isTags || isLabelTags ? (
              <Entries.TagGroup
                tagKey={isLabelTags ? State.TagKey.LABEL : State.TagKey.SAMPLE}
                modal={false}
              />
            ) : (
              <Entries.PathGroup
                name={entry.name}
                modal={false}
                dragging={dragging}
              />
            ),
          disabled: false,
        };
      case EntryKind.TAIL:
        return {
          children: <Entries.AddGroup />,
          disabled: true,
        };
      case EntryKind.EMPTY:
        return {
          children: (
            <Entries.Empty
              text={
                group === "tags"
                  ? tagText.sample
                  : group === "label tags"
                  ? tagText.label
                  : "No fields"
              }
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
            <Suspense fallback={"WW"}>
              <FieldsSidebar
                entries={entries}
                setEntries={setEntries}
                render={renderGridEntry}
              />
            </Suspense>
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
