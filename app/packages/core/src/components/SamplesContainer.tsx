import { OPERATOR_PROMPT_AREAS, OperatorPromptArea } from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import { Controller } from "@react-spring/web";
import React, { useCallback } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import MainSpace from "./MainSpace";
import SchemaSettings from "./Schema/SchemaSettings";
import { Entries, default as RenderSidebar } from "./Sidebar";
import { Filter } from "./Sidebar/Entries";
import SidebarContainer from "./Sidebar/SidebarContainer";
import ViewSelection from "./Sidebar/ViewSelection";

const Container = styled.div`
  display: flex;
  justify-content: space-between;
  flex-grow: 1;
  overflow: hidden;
  background: ${({ theme }) => theme.background.header};
`;

const TopContainer = styled.div`
  padding: 1rem 1rem 0.5rem 1rem;
  background: ${({ theme }) => theme.background.mediaSpace};
  display: flex;
  flex-direction: column;
  row-gap: 0.5rem;
  border-radius: 0 6px 0 0;
`;

const Sidebar = () => {
  const disabled = useRecoilValue(fos.disabledCheckboxPaths);
  const renderGridEntry = useCallback(
    (
      key: string,
      group: string,
      entry: fos.SidebarEntry,
      controller: Controller,
      trigger: (
        event: React.MouseEvent<HTMLDivElement>,
        key: string,
        cb: () => void
      ) => void
    ) => {
      switch (entry.kind) {
        case fos.EntryKind.PATH: // e.g. metadata
          const isDisabled = disabled.has(entry.path);

          return {
            children: (
              <Entries.FilterablePath
                entryKey={key}
                disabled={isDisabled}
                group={group}
                key={key}
                modal={false}
                path={entry.path}
                onBlur={() => {
                  controller.set({ zIndex: "0", overflow: "hidden" });
                }}
                onFocus={() => {
                  controller.set({ zIndex: "1", overflow: "visible" });
                }}
                trigger={isDisabled ? undefined : trigger}
              />
            ),
            disabled: disabled.has(entry.path),
          };
        case fos.EntryKind.GROUP:
          return {
            children: (
              <Entries.PathGroup
                entryKey={key}
                key={key}
                name={entry.name}
                modal={false}
                mutable={!["other", "tags"].includes(entry.name)}
                trigger={trigger}
              />
            ),
            disabled: false,
          };
        case fos.EntryKind.INPUT:
          return {
            children:
              entry.type === "add" ? (
                <Entries.AddGroup key={key} />
              ) : (
                <Entries.Filter modal={false} key={key} />
              ),
            disabled: true,
          };
        case fos.EntryKind.EMPTY:
          return {
            children: (
              <Entries.Empty
                useText={() => ({
                  text: "No fields",
                  loading: false,
                })}
                key={key}
              />
            ),
            disabled: true,
          };
        default:
          throw new Error("invalid entry");
      }
    },
    []
  );
  return (
    <SidebarContainer modal={false}>
      <SchemaSettings />

      <TopContainer>
        <ViewSelection id="saved-views" />
        <Filter />
      </TopContainer>

      <RenderSidebar render={renderGridEntry} />
    </SidebarContainer>
  );
};

function SamplesContainer() {
  const showSidebar = useRecoilValue(fos.sidebarVisible(false));

  const isModalOpen = useRecoilValue(fos.isModalActive);

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
    </Container>
  );
}

export default React.memo(SamplesContainer);
