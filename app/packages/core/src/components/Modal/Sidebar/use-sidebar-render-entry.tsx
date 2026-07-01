import * as fos from "@fiftyone/state";
import { Controller } from "@react-spring/core";
import React, { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { Entries } from "../../Sidebar";

export const useModalSidebarRenderEntry = () => {
  const labelPaths = useRecoilValue(fos.labelPaths({ expanded: false }));
  const disabled = useRecoilValue(fos.fullyDisabledPaths);
  const mode = useRecoilValue(fos.groupStatistics(true));

  return useCallback(
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
        case fos.EntryKind.PATH: {
          const isTag = entry.path === fos.TAGS_FIELD;
          const isLabelTag = entry.path === fos.LABEL_TAGS_FIELD;
          const isLabel = labelPaths.includes(entry.path);
          const isOther = disabled.has(entry.path);
          const isFieldPrimitive =
            !isLabelTag && !isLabel && !isOther && !(isTag && mode === "group");

          return {
            children: (
              <>
                {(isLabel ||
                  isOther ||
                  isLabelTag ||
                  (isTag && mode === "group")) && (
                  <Entries.FilterablePath
                    entryKey={key}
                    modal={true}
                    path={entry.path}
                    group={group}
                    onFocus={() => {
                      controller.set({ zIndex: "1" });
                    }}
                    onBlur={() => {
                      controller.set({ zIndex: "0" });
                    }}
                    disabled={isOther}
                    key={key}
                    trigger={trigger}
                  />
                )}
                {isFieldPrimitive && (
                  <Entries.PathValue
                    entryKey={key}
                    key={key}
                    path={entry.path}
                    trigger={trigger}
                  />
                )}
              </>
            ),
            disabled: isTag || isOther,
          };
        }
        case fos.EntryKind.GROUP: {
          return {
            children: (
              <Entries.PathGroup
                entryKey={key}
                name={entry.name}
                modal={true}
                key={key}
                mutable={
                  ![fos.OTHER_GROUP, fos.TAGS_FIELD].includes(entry.name)
                }
                trigger={trigger}
              />
            ),
            disabled: false,
          };
        }
        case fos.EntryKind.EMPTY:
          return {
            children: (
              <Entries.Empty
                useText={() => ({ text: "No fields", loading: false })}
                key={key}
              />
            ),
            disabled: true,
          };
        case fos.EntryKind.INPUT:
          return {
            children: <Entries.Filter modal={true} key={key} />,
            disabled: true,
          };
        default:
          throw new Error("invalid entry");
      }
    },
    [disabled, labelPaths, mode],
  );
};
