import * as fos from "@fiftyone/state";
import { Controller } from "@react-spring/core";
import React, {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import ReactDOM from "react-dom";
import { useRecoilValue } from "recoil";
import styled from "styled-components";

import {
  ErrorBoundary,
  HelpPanel,
  JSONPanel,
  LookerArrowLeftIcon,
  LookerArrowRightIcon,
} from "@fiftyone/components";
import { modalNavigation } from "@fiftyone/state";
import Sidebar, { Entries } from "../Sidebar";
import Group from "./Group";
import Sample from "./Sample";
import Sample3d from "./Sample3d";

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

const Arrow = styled.span<{ isRight?: boolean }>`
  cursor: pointer;
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: space-between;
  right: ${(props) => (props.isRight ? "0.75rem" : "initial")};
  left: ${(props) => (props.isRight ? "initial" : "0.75rem")};
  z-index: 99999;
  padding: 0.75rem;
  bottom: 40vh;
  width: 3rem;
  height: 3rem;
  background-color: var(--joy-palette-background-button);
  box-shadow: 0 1px 3px var(--joy-palette-custom-shadowDark);
  border-radius: 3px;
  opacity: 0.6;
  transition: opacity 0.15s ease-in-out;
  transition: box-shadow 0.15s ease-in-out;
  &:hover {
    opacity: 1;
    box-shadow: inherit;
    transition: box-shadow 0.15s ease-in-out;
    transition: opacity 0.15s ease-in-out;
  }
`;

const SampleModal = () => {
  const labelPaths = useRecoilValue(fos.labelPaths({ expanded: false }));
  const clearModal = fos.useClearModal();
  const override = useRecoilValue(fos.sidebarOverride);
  const disabled = useRecoilValue(fos.disabledPaths);

  const navigation = useRecoilValue(modalNavigation);

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
        case fos.EntryKind.PATH: {
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
        }
        case fos.EntryKind.GROUP: {
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
        }
        case fos.EntryKind.EMPTY:
          return {
            children: (
              <Entries.Empty
                useText={
                  group === "tags"
                    ? () => fos.useTagText(true)
                    : group === "label tags"
                    ? () => fos.useLabelTagText(true)
                    : () => "No fields"
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
    []
  );

  const screen = useRecoilValue(fos.fullscreen)
    ? { width: "100%", height: "100%" }
    : { width: "95%", height: "90%", borderRadius: "3px" };
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isGroup = useRecoilValue(fos.isGroup);
  const isPcd = useRecoilValue(fos.isPointcloudDataset);
  const jsonPanel = fos.useJSONPanel();
  const helpPanel = fos.useHelpPanel();

  const [isNavigationHidden, setIsNavigationHidden] = useState(false);

  const navigateNext = useCallback(() => {
    jsonPanel.close();
    helpPanel.close();
    navigation.setIndex(navigation.index + 1);
  }, [navigation, jsonPanel, helpPanel]);

  const navigatePrevious = useCallback(() => {
    jsonPanel.close();
    helpPanel.close();

    if (navigation.index > 0) {
      navigation.setIndex(navigation.index - 1);
    }
  }, [navigation, jsonPanel, helpPanel]);

  const keyboardHandler = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigatePrevious();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        navigateNext();
      } else if (e.key === "c") {
        e.preventDefault();
        setIsNavigationHidden((prev) => !prev);
      }
      // note: don't stop event propagation here
    },
    [navigateNext, navigatePrevious]
  );

  useEffect(() => {
    document.addEventListener("keydown", keyboardHandler);
    return () => document.removeEventListener("keydown", keyboardHandler);
  }, [keyboardHandler]);

  return ReactDOM.createPortal(
    <Fragment>
      <ModalWrapper
        ref={wrapperRef}
        onClick={(event) => event.target === wrapperRef.current && clearModal()}
      >
        <Container style={{ ...screen, zIndex: 10001 }}>
          <ContentColumn>
            {!isNavigationHidden && navigation.index > 0 && (
              <Arrow>
                <LookerArrowLeftIcon onClick={navigatePrevious} />
              </Arrow>
            )}
            {!isNavigationHidden && (
              <Arrow isRight>
                <LookerArrowRightIcon onClick={navigateNext} />
              </Arrow>
            )}
            <ErrorBoundary onReset={() => {}}>
              {isGroup ? <Group /> : isPcd ? <Sample3d /> : <Sample />}
              {jsonPanel.isOpen && (
                <JSONPanel
                  containerRef={jsonPanel.containerRef}
                  onClose={() => jsonPanel.close()}
                  onCopy={() => jsonPanel.copy()}
                  json={jsonPanel.json}
                />
              )}
              {helpPanel.isOpen && (
                <HelpPanel
                  containerRef={helpPanel.containerRef}
                  onClose={() => helpPanel.close()}
                  items={helpPanel.items}
                />
              )}
            </ErrorBoundary>
          </ContentColumn>
          <Sidebar render={renderEntry} modal={true} />
        </Container>
      </ModalWrapper>
    </Fragment>,
    document.getElementById("modal") as HTMLDivElement
  );
};

export default React.memo(SampleModal);
