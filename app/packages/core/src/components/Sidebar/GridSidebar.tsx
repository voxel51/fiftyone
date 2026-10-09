import * as fos from "@fiftyone/state";
import type { Controller } from "@react-spring/web";
import React, { useCallback } from "react";
import { useReverbValue } from "@fiftyone/reverb";
import styled from "styled-components";
import { Entries, default as RenderSidebar } from ".";
import { Filter } from "./Entries";
import SchemaLensRow from "./SchemaLensRow";
import { createExploreIsDisabled } from "./InteractiveSidebar";
import SidebarContainer from "./SidebarContainer";
import ViewSelection from "./ViewSelection";

const TopContainer = styled.div`
  padding: 1rem 1rem 0.5rem 1rem;
  background: ${({ theme }) => theme.background.mediaSpace};
  display: flex;
  flex-direction: column;
  row-gap: 0.5rem;
  border-radius: 0 6px 0 0;
`;

/** The grid's filtering and field visibility, inside the Samples panel. */
const GridSidebar = () => {
  const disabled = useReverbValue(fos.disabledCheckboxPaths);
  const renderGridEntry = useCallback(
    (
      key: string,
      group: string,
      entry: fos.SidebarEntry,
      controller: Controller,
      trigger: (
        event: React.MouseEvent<HTMLDivElement>,
        key: string,
        cb: () => void,
      ) => void,
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
                mutable={
                  ![fos.OTHER_GROUP, fos.TAGS_FIELD].includes(entry.name)
                }
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
    [disabled],
  );

  return (
    <SidebarContainer modal={false}>
      <TopContainer>
        <ViewSelection />
        <SchemaLensRow padded={false} />
        <Filter />
      </TopContainer>

      <RenderSidebar
        isDisabled={createExploreIsDisabled(disabled)}
        useEntries={fos.useGridEntries}
        render={renderGridEntry}
        modal={false}
      />
    </SidebarContainer>
  );
};

export default React.memo(GridSidebar);
