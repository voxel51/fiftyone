import React, { useCallback, useRef } from "react";
import { Controller } from "@react-spring/core";
import styled from "styled-components";
import { useRecoilValue, useRecoilCallback } from "recoil";

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
import * as selectors from "../recoil/selectors";
import * as schemaAtoms from "../recoil/schema";
import { State } from "../recoil/types";
import { getSampleSrc, useClearModal } from "../recoil/utils";
import { useMessageHandler } from "../utils/hooks";

export const ModalWrapper = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme }) => theme.overlay};
`;

const Container = styled.div`
  overflow: hidden;
  position: relative;
  display: flex;
  justify-content: space-between;
  background-color: ${({ theme }) => theme.backgroundDark};
  border: 1px solid ${({ theme }) => theme.backgroundDarkBorder};
`;

const ContentColumn = styled.div`
  flex-grow: 1;
  width: 1px;
  position: relative;
  overflow: visible;
`;

type Props = {
  onClose: () => void;
};

interface SelectEvent {
  detail: {
    id: string;
    field: string;
    frameNumber?: number;
  };
}

const useOnSelectLabel = () => {
  return useRecoilCallback(
    ({ snapshot, set }) => async ({
      detail: { id, field, frameNumber },
    }: SelectEvent) => {
      const { sample } = await snapshot.getPromise(atoms.modal);
      let labels = {
        ...(await snapshot.getPromise(selectors.selectedLabels)),
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

      set(selectors.selectedLabels, labels);
    },
    []
  );
};

const SampleModal = () => {
  const {
    sample: { filepath, _id },
    index,
    getIndex,
  } = useRecoilValue(atoms.modal);
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
    (group: string, entry: SidebarEntry, controller: Controller) => {
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
                    modal={true}
                    tagKey={
                      isLabelTag ? State.TagKey.LABEL : State.TagKey.SAMPLE
                    }
                    tag={entry.path.split(".").slice(1).join(".")}
                  />
                )}
                {isTag && (
                  <Entries.TagValue
                    tag={entry.path.slice("tags.".length)}
                    path={entry.path}
                  />
                )}
                {(isLabel || isOther) && (
                  <Entries.FilterablePath
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
                  />
                )}
                {isFieldPrimitive && <Entries.PathValue path={entry.path} />}
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
                  tagKey={
                    isLabelTags ? State.TagKey.LABEL : State.TagKey.SAMPLE
                  }
                  modal={true}
                />
              ) : (
                <Entries.PathGroup name={entry.name} modal={true} />
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

  const screen = useRecoilValue(atoms.fullscreen)
    ? { width: "100%", height: "100%" }
    : { width: "95%", height: "90%", borderRadius: "3px" };
  const wrapperRef = useRef();

  return (
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
    </ModalWrapper>
  );
};

export default React.memo(SampleModal);
