import {
  ErrorBoundary,
  HelpPanel,
  JSONPanel,
  LookerArrowLeftIcon,
  LookerArrowRightIcon,
} from "@fiftyone/components";
import { AbstractLooker } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import { modalNavigation, useEventHandler } from "@fiftyone/state";
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
import Sidebar, { Entries } from "../Sidebar";
import Group from "./Group";
import Sample from "./Sample";
import { Sample3d } from "./Sample3d";
import { TooltipInfo } from "./TooltipInfo";

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
  const override = useRecoilValue(fos.pinned3DSample);
  const disabled = useRecoilValue(fos.disabledPaths);

  const lookerRef = useRef<AbstractLooker>();

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
        case fos.EntryKind.PATH:
          const isTag = entry.path.startsWith("tags");
          const isLabelTag = entry.path.startsWith("_label_tags");
          const isLabel = labelPaths.includes(entry.path);
          const isOther = disabled.has(entry.path);
          const isFieldPrimitive = !isLabelTag && !isLabel && !isOther;

          return {
            children: (
              <>
                {(isLabel || isOther || isLabelTag) && (
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

        case fos.EntryKind.GROUP: {
          return {
            children: (
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
      const active = document.activeElement;
      if (active?.tagName === "INPUT") {
        if ((active as HTMLInputElement).type === "text") {
          return;
        }
      }
      if (e.key === "ArrowLeft") {
        navigatePrevious();
      } else if (e.key === "ArrowRight") {
        navigateNext();
      } else if (e.key === "c") {
        setIsNavigationHidden((prev) => !prev);
      }
      // note: don't stop event propagation here
    },
    [navigateNext, navigatePrevious]
  );

  useEventHandler(document, "keydown", keyboardHandler);

  const tooltip = fos.useTooltip();

  const eventHandler = useCallback(
    (e) => {
      tooltip.setDetail(e.detail ? e.detail : null);
      e.detail && tooltip.setCoords(e.detail.coordinates);
    },
    [tooltip]
  );

  /**
   * a bit hacky, this is using the callback-ref pattern to get looker reference so that event handler can be registered
   * note: cannot use `useEventHandler()` hook since there's no direct reference to looker in Modal
   */
  const lookerRefCallback = useCallback(
    (looker: AbstractLooker) => {
      lookerRef.current = looker;
      looker.addEventListener("tooltip", eventHandler);
    },
    [eventHandler]
  );

  useEffect(() => {
    return () => {
      lookerRef.current &&
        lookerRef.current.removeEventListener("tooltip", eventHandler);
    };
  }, [eventHandler]);

  return ReactDOM.createPortal(
    <Fragment>
      <ModalWrapper
        ref={wrapperRef}
        onClick={(event) => event.target === wrapperRef.current && clearModal()}
      >
        <Container style={{ ...screen, zIndex: 10001 }}>
          <TooltipInfo coordinates={tooltip.coordinates} />
          <ContentColumn>
            {!isNavigationHidden && navigation.index > 0 && (
              <Arrow>
                <LookerArrowLeftIcon
                  data-cy="nav-left-button"
                  onClick={navigatePrevious}
                />
              </Arrow>
            )}
            {!isNavigationHidden && (
              <Arrow isRight>
                <LookerArrowRightIcon
                  data-cy="nav-right-button"
                  onClick={navigateNext}
                />
              </Arrow>
            )}
            <ErrorBoundary onReset={() => {}}>
              {isGroup ? (
                <Group lookerRefCallback={lookerRefCallback} />
              ) : isPcd ? (
                <Sample3d />
              ) : (
                <Sample lookerRefCallback={lookerRefCallback} />
              )}
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
