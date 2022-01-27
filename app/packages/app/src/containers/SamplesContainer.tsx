import React, { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { Controller } from "@react-spring/web";
import styled from "styled-components";

import FieldsSidebar, {
  EntryKind,
  Entries,
  SidebarEntry,
  useTagText,
  disabledPaths,
} from "../components/Sidebar";
import ContainerHeader from "../components/ImageContainerHeader";
import Flashlight from "../components/Flashlight";

import * as atoms from "../recoil/atoms";
import { State } from "../recoil/types";

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
  const tagText = useTagText(false);
  const showSidebar = useRecoilValue(atoms.sidebarVisible(false));
  const disabled = useRecoilValue(disabledPaths);

  const renderGridEntry = useCallback(
    (
      key: string,
      group: string,
      entry: SidebarEntry,
      controller: Controller
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
                  key={key}
                />
              ) : (
                <Entries.FilterablePath
                  modal={false}
                  path={entry.path}
                  group={group}
                  disabled={disabled.has(entry.path)}
                  onFocus={() => {
                    controller.set({ zIndex: "1" });
                  }}
                  onBlur={() => {
                    controller.set({ zIndex: "0" });
                  }}
                  key={key}
                />
              ),
            disabled: isTag || isLabelTag || disabled.has(entry.path),
          };
        case EntryKind.GROUP:
          const isTags = entry.name === "tags";
          const isLabelTags = entry.name === "label tags";

          return {
            children:
              isTags || isLabelTags ? (
                <Entries.TagGroup
                  tagKey={
                    isLabelTags ? State.TagKey.LABEL : State.TagKey.SAMPLE
                  }
                  modal={false}
                  key={key}
                />
              ) : (
                <Entries.PathGroup
                  name={entry.name}
                  modal={false}
                  mutable={entry.name !== "other"}
                  key={key}
                />
              ),
            disabled: false,
          };
        case EntryKind.INPUT:
          return {
            children:
              entry.type === "add" ? (
                <Entries.AddGroup key={key} />
              ) : (
                <Entries.Filter modal={false} key={key} />
              ),
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
                key={key}
              />
            ),
            disabled: true,
          };
        default:
          throw new Error("invalid entry");
      }
    },
    [tagText]
  );

  return (
    <Container>
      {showSidebar && <FieldsSidebar render={renderGridEntry} modal={false} />}

      <ContentColumn>
        <Flashlight key={"flashlight"} />
        <ContainerHeader key={"header"} />
      </ContentColumn>
    </Container>
  );
});

export default SamplesContainer;
