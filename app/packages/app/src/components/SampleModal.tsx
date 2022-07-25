import React, { useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import { Controller } from "@react-spring/core";
import styled from "styled-components";
import { useRecoilValue, useRecoilTransaction_UNSTABLE } from "recoil";

import { FrameLooker, ImageLooker, VideoLooker } from "@fiftyone/looker";

import Looker from "../components/Looker";

import Group from "./Group/Group";
import Sidebar, { Entries } from "./Sidebar";
import * as fos from "@fiftyone/state";

import PinnedLooker from "./PinnedLooker/PinnedLooker";
import { isGroup, isPinned } from "@fiftyone/state";

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
  background-color: ${({ theme }) => theme.overlay};
`;

const Container = styled.div`
  background-color: ${({ theme }) => theme.backgroundDark};
  border: 1px solid ${({ theme }) => theme.backgroundDarkBorder};
  position: relative;
  display: flex;
  justify-content: center;
  overflow: hidden;
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
  const data = useRecoilValue(fos.modal);
  if (!data) {
    throw new Error("no modal data");
  }

  const {
    sample: { filepath, _id },
    navigation: { index, getIndex },
  } = data;

  const sampleSrc = fos.getSampleSrc(filepath, _id);
  const lookerRef = useRef<VideoLooker & ImageLooker & FrameLooker>();
  const onSelectLabel = fos.useOnSelectLabel();
  const tagText = fos.useTagText(true);
  const labelPaths = useRecoilValue(fos.labelPaths({ expanded: false }));
  const clearModal = fos.useClearModal();
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
                    key={key}
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
  const wrapperRef = useRef();
  const queryRef = useRecoilValue(fos.paginateGroupQueryRef);
  const isGroupMode = useRecoilValue(isGroup) && queryRef;

  return ReactDOM.createPortal(
    <ModalWrapper
      ref={wrapperRef}
      key={0}
      onClick={(event) => event.target === wrapperRef.current && clearModal()}
    >
      <Container style={{ ...screen, zIndex: 10001 }}>
        <ContentColumn>
          <Looker
            key={`modal-${sampleSrc}`}
            lookerRef={lookerRef}
            onSelectLabel={onSelectLabel}
            onClose={clearModal}
            onPrevious={index > 0 ? () => getIndex(index - 1) : undefined}
            onNext={() => getIndex(index + 1)}
            style={{ flex: 1 }}
            isGroupMainView={isGroupMode}
          />
          {isGroupMode && <Group queryRef={queryRef} />}
        </ContentColumn>
        {useRecoilValue(isPinned) && queryRef && (
          <PinnedLooker queryRef={queryRef} />
        )}
        <Sidebar render={renderEntry} modal={true} />
      </Container>
    </ModalWrapper>,
    document.getElementById("modal")
  );
};

export default React.memo(SampleModal);
