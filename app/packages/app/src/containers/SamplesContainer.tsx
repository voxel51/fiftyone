import React from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { Controller } from "@react-spring/web";
import styled from "styled-components";
import { Resizable } from "re-resizable";

import FieldsSidebar, {
  EntryKind,
  Entries,
  SidebarEntry,
  useTagText,
  useEntries,
} from "../components/Sidebar";
import ContainerHeader from "../components/ImageContainerHeader";
import Flashlight from "../components/Flashlight";

import * as atoms from "../recoil/atoms";
import { State } from "../recoil/types";
import { useTheme } from "../utils/hooks";

const SidebarContainer = styled(Resizable)`
  display: block;
  height: 100%;
  overflow: visible;
  position: relative;
`;

const ContentColumn = styled.div`
  flex-grow: 1;
  width: 1px;
  position: relative;
  padding-left: 1rem;
`;

const Container = styled.div`
  display: flex;
  justify-content: space-between;
  flex-grow: 1;
  overflow: hidden;
  background: ${({ theme }) => theme.backgroundDark};
`;

const SamplesContainer = React.memo(() => {
  const theme = useTheme();
  const tagText = useTagText();
  const [entries, setEntries] = useEntries(false);
  const [sidebarWidth, setSidebarWidth] = useRecoilState(
    atoms.sidebarWidth(false)
  );
  const showSidebar = useRecoilValue(atoms.sidebarVisible(false));

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
    <Container>
      {showSidebar && (
        <SidebarContainer
          defaultSize={{ width: sidebarWidth }}
          minWidth={200}
          enable={{
            top: false,
            right: true,
            bottom: false,
            left: false,
            topRight: false,
            bottomRight: false,
            bottomLeft: false,
            topLeft: false,
          }}
          onResizeStop={(e, direction, ref, { width }) => {
            setSidebarWidth(width);
          }}
          handleComponent={() => <div>HELLO</div>}
        >
          <FieldsSidebar
            entries={entries}
            setEntries={setEntries}
            render={renderGridEntry}
          />
        </SidebarContainer>
      )}
      <ContentColumn>
        <Flashlight key={"flashlight"} />
        <ContainerHeader key={"header"} />
      </ContentColumn>
    </Container>
  );
});

export default SamplesContainer;
