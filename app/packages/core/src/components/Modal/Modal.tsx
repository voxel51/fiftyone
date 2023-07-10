import { ErrorBoundary, HelpPanel, JSONPanel } from "@fiftyone/components";
import { AbstractLooker } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import { Controller } from "@react-spring/core";
import React, {
  Fragment,
  Suspense,
  useCallback,
  useEffect,
  useRef,
} from "react";
import ReactDOM from "react-dom";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import Sidebar, { Entries } from "../Sidebar";
import Group from "./Group";
import { GroupContextProvider } from "./Group/GroupContextProvider";
import ModalNavigation from "./ModalNavigation";
import Sample from "./Sample";
import { Sample3d } from "./Sample3d";
import { TooltipInfo } from "./TooltipInfo";
import { usePanels } from "./hooks";

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
  height: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
`;

const SampleModal = () => {
  const lookerRef = useRef<AbstractLooker>();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const disabled = useRecoilValue(fos.disabledPaths);
  const labelPaths = useRecoilValue(fos.labelPaths({ expanded: false }));

  const mode = useRecoilValue(fos.groupStatistics(true));
  const override = useRecoilValue(fos.pinned3DSample);
  const screen = useRecoilValue(fos.fullscreen)
    ? { width: "100%", height: "100%" }
    : { width: "95%", height: "90%", borderRadius: "3px" };
  const isGroup = useRecoilValue(fos.isGroup);
  const isPcd = useRecoilValue(fos.isPointcloudDataset);

  const clearModal = fos.useClearModal();
  const { jsonPanel, helpPanel, onNavigate } = usePanels();
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
          const isTag = entry.path === "tags";
          const isLabelTag = entry.path === "_label_tags";
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
                    key={`${key}-${override}`}
                    path={entry.path}
                    trigger={trigger}
                  />
                )}
              </>
            ),
            disabled: isTag || isOther,
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
    [disabled, labelPaths, mode, override]
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
        <Container style={{ ...screen, zIndex: 10001 }} data-cy="modal">
          <TooltipInfo />
          <ContentColumn>
            <ModalNavigation onNavigate={onNavigate} />
            <ErrorBoundary onReset={() => {}}>
              <Suspense>
                {isGroup ? (
                  <GroupContextProvider lookerRefCallback={lookerRefCallback}>
                    <Group />
                  </GroupContextProvider>
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
              </Suspense>
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
