import React, { useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import { Controller } from "@react-spring/core";
import styled from "styled-components";
import { useRecoilValue, useRecoilTransaction_UNSTABLE } from "recoil";

import { FrameLooker, ImageLooker, VideoLooker } from "@fiftyone/looker";

import FieldsSidebar, {
  disabledPaths,
  Entries,
  EntryKind,
  SidebarEntry,
  useTagText,
} from "../components/Sidebar";
import Looker from "../components/Looker";
import * as atoms from "../recoil/atoms";
import * as schemaAtoms from "../recoil/schema";
import { State } from "../recoil/types";
import { getSampleSrc, useClearModal } from "../recoil/utils";
import { useSetSelectedLabels } from "../utils/hooks";

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
`;

interface SelectEvent {
  detail: {
    id: string;
    field: string;
    frameNumber?: number;
  };
}

const useOnSelectLabel = () => {
  const send = useSetSelectedLabels();
  return useRecoilTransaction_UNSTABLE(
    ({ get, set }) =>
      ({ detail: { id, field, frameNumber } }: SelectEvent) => {
        const { sample } = get(atoms.modal);
        let labels = {
          ...get(atoms.selectedLabels),
        };
        if (labels[id]) {
          delete labels[id];
        } else {
          labels[id] = {
            field,
            sampleId: sample._id,
            frameNumber,
          };
        }

        set(atoms.selectedLabels, labels);
        send(
          Object.entries(labels).map(([labelId, data]) => ({
            ...data,
            labelId,
          }))
        );
      },
    []
  );
};

const SampleModal = () => {
  const { sample, index, getIndex } = useRecoilValue(atoms.modal);
  const { filepath, _id } = sample;
  const sampleSrc = getSampleSrc(filepath, _id);
  const lookerRef = useRef<VideoLooker & ImageLooker & FrameLooker>();
  const onSelectLabel = useOnSelectLabel();
  const tagText = useTagText(true);
  const labelPaths = useRecoilValue(
    schemaAtoms.labelPaths({ expanded: false })
  );
  const clearModal = useClearModal();
  const disabled = useRecoilValue(disabledPaths);

  const renderEntry = useCallback(
    (
      key: string,
      group: string,
      entry: SidebarEntry,
      controller: Controller,
      trigger: (
        event: React.MouseEvent<HTMLDivElement>,
        key: string,
        cb: () => void
      ) => void
    ) => {
      switch (entry.kind) {
        case EntryKind.PATH:
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
                      isLabelTag ? State.TagKey.LABEL : State.TagKey.SAMPLE
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
        case EntryKind.GROUP:
          const isTags = entry.name === "tags";
          const isLabelTags = entry.name === "label tags";

          return {
            children:
              isTags || isLabelTags ? (
                <Entries.TagGroup
                  entryKey={key}
                  tagKey={
                    isLabelTags ? State.TagKey.LABEL : State.TagKey.SAMPLE
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
        case EntryKind.INPUT:
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

  const screen = useRecoilValue(atoms.fullscreen)
    ? { width: "100%", height: "100%" }
    : { width: "95%", height: "90%", borderRadius: "3px" };
  const wrapperRef = useRef();

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
            onPrevious={index > 0 ? () => getIndex(index - 1) : null}
            onNext={() => getIndex(index + 1)}
          />
        </ContentColumn>
        <FieldsSidebar render={renderEntry} modal={true} />
      </Container>
    </ModalWrapper>,
    document.getElementById("modal")
  );
};

export default React.memo(SampleModal);
