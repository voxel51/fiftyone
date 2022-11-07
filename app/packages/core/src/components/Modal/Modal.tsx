import * as fos from "@fiftyone/state";
import { Controller } from "@react-spring/core";
import _ from "lodash";
import React, { Fragment, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import styled from "styled-components";
import { useRecoilValue } from "recoil";

import Sidebar, { Entries } from "../Sidebar";
import Group from "./Group";
import Sample from "./Sample";
import { HelpPanel, JSONPanel } from "@fiftyone/components";

const ModalWrapper = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10000;
  align-items: center;
  display: flex;
  justify-content: center;
  background-color: ${({ theme }) => theme.neutral.softBg};
`;

const Container = styled.div`
  background-color: ${({ theme }) => theme.background.level2};
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};
  position: relative;
  display: flex;
  justify-content: center;
  overflow: hidden;
  box-shadow: 0 20px 25px -20px #000;
`;

const ContentColumn = styled.div`
  flex-grow: 1;
  width: 1px;
  position: relative;
  overflow: visible;
  display: flex;
  flex-direction: column;
`;

const SampleModal = () => {
  const tagText = fos.useTagText(true);
  const labelPaths = useRecoilValue(fos.labelPaths({ expanded: false }));
  const clearModal = fos.useClearModal();
  const override = useRecoilValue(fos.sidebarOverride);
  const disabled = useRecoilValue(fos.disabledPaths);

  const renderEntry = useCallback(
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
        case fos.EntryKind.PATH:
          const isTag = entry.path.startsWith("tags.");
          const isLabelTag = entry.path.startsWith("_label_tags.");
          const isLabel = labelPaths.includes(entry.path);
          const isOther = disabled.has(entry.path);
          const isFieldPrimitive =
            !isTag && !isLabelTag && !isLabel && !isOther;

          return {
            children: (
              <>
                {isLabelTag && (
                  <Entries.FilterableTag
                    key={key}
                    modal={true}
                    tag={entry.path.split(".").slice(1).join(".")}
                    tagKey={
                      isLabelTag
                        ? fos.State.TagKey.LABEL
                        : fos.State.TagKey.SAMPLE
                    }
                  />
                )}
                {isTag && (
                  <Entries.TagValue
                    key={key}
                    path={entry.path}
                    tag={entry.path.slice("tags.".length)}
                  />
                )}
                {(isLabel || isOther) && (
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
                    key={`${key}-${override}`}
                    path={entry.path}
                    trigger={trigger}
                  />
                )}
              </>
            ),
            disabled: isTag || isLabelTag || isOther,
          };
        case fos.EntryKind.GROUP:
          const isTags = entry.name === "tags";
          const isLabelTags = entry.name === "label tags";

          return {
            children:
              isTags || isLabelTags ? (
                <Entries.TagGroup
                  entryKey={key}
                  tagKey={
                    isLabelTags
                      ? fos.State.TagKey.LABEL
                      : fos.State.TagKey.SAMPLE
                  }
                  modal={true}
                  key={key}
                  trigger={trigger}
                />
              ) : (
                <Entries.PathGroup
                  entryKey={key}
                  name={entry.name}
                  modal={true}
                  key={key}
                  trigger={trigger}
                />
              ),
            disabled: false,
          };
        case fos.EntryKind.EMPTY:
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
        case fos.EntryKind.INPUT:
          return {
            children: <Entries.Filter modal={true} key={key} />,
            disabled: true,
          };
        default:
          throw new Error("invalid entry");
      }
    },
    [tagText]
  );

  const screen = useRecoilValue(fos.fullscreen)
    ? { width: "100%", height: "100%" }
    : { width: "95%", height: "90%", borderRadius: "3px" };
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isGroup = useRecoilValue(fos.isGroup);
  const jsonPanel = fos.useJSONPanel();
  const helpPanel = fos.useHelpPanel();

  return ReactDOM.createPortal(
    <Fragment>
      <ModalWrapper
        ref={wrapperRef}
        onClick={(event) => event.target === wrapperRef.current && clearModal()}
      >
        <Container style={{ ...screen, zIndex: 10001 }}>
          <ContentColumn>
            {isGroup ? <Group /> : <Sample />}
            {jsonPanel.isOpen && (
              <JSONPanel
                containerRef={jsonPanel.containerRef}
                jsonHTML={jsonPanel.jsonHTML}
                onClose={() => jsonPanel.close()}
                onCopy={() => jsonPanel.copy()}
              />
            )}
            {helpPanel.isOpen && (
              <HelpPanel
                containerRef={helpPanel.containerRef}
                onClose={() => helpPanel.close()}
                items={helpPanel.items}
              />
            )}
          </ContentColumn>
          <Sidebar render={renderEntry} modal={true} />
        </Container>
      </ModalWrapper>
    </Fragment>,
    document.getElementById("modal") as HTMLDivElement
  );
};

export default React.memo(SampleModal);
