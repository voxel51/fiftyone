import React, { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { Controller } from "@react-spring/web";
import styled from "styled-components";
import Sidebar, { Entries } from "./Sidebar";
import * as fos from "@fiftyone/state";
import MainSpace from "./MainSpace";

const Container = styled.div`
  display: flex;
  justify-content: space-between;
  flex-grow: 1;
  overflow: hidden;
  background: ${({ theme }) => theme.background.header};
`;

function SamplesContainer() {
  const showSidebar = useRecoilValue(fos.sidebarVisible(false));
  const disabled = useRecoilValue(fos.disabledPaths);

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
                trigger={isDisabled ? null : trigger}
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
                useText={
                  group === "tags"
                    ? () => fos.useTagText(false)
                    : group === "label tags"
                    ? () => fos.useLabelTagText(false)
                    : () => ({
                        text: "No fields",
                      })
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
    []
  );
  return (
    <Container>
      {showSidebar && <Sidebar render={renderGridEntry} modal={false} />}
      <MainSpace />
    </Container>
  );
}

export default React.memo(SamplesContainer);
