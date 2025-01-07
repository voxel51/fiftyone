import { HelpPanel, JSONPanel } from "@fiftyone/components";
import { OPERATOR_PROMPT_AREAS, OperatorPromptArea } from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import { useRecoilCallback, useRecoilValue } from "recoil";
import styled from "styled-components";
import { ModalActionsRow } from "../Actions";
import Sidebar from "../Sidebar";
import { useOnSidebarSelectionChange } from "../Sidebar/useOnSidebarSelectionChange";
import ModalNavigation from "./ModalNavigation";
import { ModalSpace } from "./ModalSpace";
import { TooltipInfo } from "./TooltipInfo";
import { useLookerHelpers, useTooltipEventHandler } from "./hooks";
import { modalContext } from "./modal-context";
import { useModalSidebarRenderEntry } from "./use-sidebar-render-entry";

const ModalWrapper = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1000; // do not set more than 1300 (operator panel)
  align-items: center;
  display: flex;
  justify-content: center;
  background-color: ${({ theme }) => theme.neutral.softBg};
`;

const ModalContainer = styled.div`
  background-color: ${({ theme }) => theme.background.level2};
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};
  position: relative;
  display: flex;
  justify-content: center;
  overflow: hidden;
  box-shadow: 0 20px 25px -20px #000;
  z-index: 10001;
`;

const SpacesContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 1501;
`;

const SidebarPanelBlendInDiv = styled.div`
  height: 2em;
  background-color: #262626;
  width: 100%;
  margin-bottom: 1px;
  flex-shrink: 0;
`;

const SidebarContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
`;

const Modal = () => {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const clearModal = fos.useClearModal();

  const onClickModalWrapper = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === wrapperRef.current) {
        clearModal();
      }
    },
    [clearModal]
  );

  const renderEntry = useModalSidebarRenderEntry();

  const { jsonPanel, helpPanel } = useLookerHelpers();

  const select = fos.useSelectSample();

  const modalCloseHandler = useRecoilCallback(
    ({ snapshot, set }) =>
      async () => {
        const isTooltipCurrentlyLocked = await snapshot.getPromise(
          fos.isTooltipLocked
        );
        if (isTooltipCurrentlyLocked) {
          set(fos.isTooltipLocked, false);
          return;
        }

        jsonPanel.close();
        helpPanel.close();

        const isFullScreen = await snapshot.getPromise(fos.fullscreen);

        if (isFullScreen) {
          set(fos.fullscreen, false);
          return;
        }

        clearModal();
        activeLookerRef.current?.removeEventListener(
          "close",
          modalCloseHandler
        );
      },
    [clearModal, jsonPanel, helpPanel]
  );

  const keysHandler = useRecoilCallback(
    ({ snapshot, set }) =>
      async (e: KeyboardEvent) => {
        const active = document.activeElement;
        if (active?.tagName === "INPUT") {
          if ((active as HTMLInputElement).type === "text") {
            return;
          }
        }

        if (e.altKey && e.code === "Space") {
          const hoveringSampleId = (
            await snapshot.getPromise(fos.hoveredSample)
          )?._id;
          if (hoveringSampleId) {
            select(hoveringSampleId);
          } else {
            const modalSampleId = await snapshot.getPromise(fos.modalSampleId);
            if (modalSampleId) {
              select(modalSampleId);
            }
          }
        } else if (e.key === "s") {
          set(fos.sidebarVisible(true), (prev) => !prev);
        } else if (e.key === "f") {
          set(fos.fullscreen, (prev) => !prev);
        } else if (e.key === "x") {
          const current = await snapshot.getPromise(fos.modalSelector);
          set(fos.selectedSamples, (selected) => {
            const newSelected = new Set([...Array.from(selected)]);
            if (current?.id) {
              if (newSelected.has(current.id)) {
                newSelected.delete(current.id);
              } else {
                newSelected.add(current.id);
              }
            }

            return newSelected;
          });
        } else if (e.key === "Escape") {
          if (activeLookerRef.current) {
            // we handle close logic in modal + other places
            return;
          }

          await modalCloseHandler();
        }
      },
    []
  );

  fos.useEventHandler(document, "keyup", keysHandler);

  const isFullScreen = useRecoilValue(fos.fullscreen);

  const { closePanels } = useLookerHelpers();

  const screenParams = useMemo(() => {
    return isFullScreen
      ? { width: "100%", height: "100%" }
      : { width: "95%", height: "calc(100% - 70px)", borderRadius: "8px" };
  }, [isFullScreen]);

  const activeLookerRef = useRef<fos.Lookers>();

  const labelsToggleTracker = useOnSidebarSelectionChange({ modal: true });

  useEffect(() => {
    activeLookerRef.current?.refreshSample();
  }, [labelsToggleTracker]);

  const addTooltipEventHandler = useTooltipEventHandler();
  const removeTooltipEventHanlderRef = useRef<ReturnType<
    typeof addTooltipEventHandler
  > | null>(null);

  const onLookerSet = useCallback(
    (looker: fos.Lookers) => {
      looker.addEventListener("close", modalCloseHandler);

      // remove previous event listener
      removeTooltipEventHanlderRef.current?.();
      removeTooltipEventHanlderRef.current = addTooltipEventHandler(looker);
    },
    [modalCloseHandler, addTooltipEventHandler]
  );

  const setActiveLookerRef = useCallback(
    (looker: fos.Lookers) => {
      activeLookerRef.current = looker;
      onLookerSet(looker);
    },
    [onLookerSet]
  );

  return ReactDOM.createPortal(
    <modalContext.Provider
      value={{
        activeLookerRef,
        setActiveLookerRef,
      }}
    >
      <ModalWrapper
        ref={wrapperRef}
        onClick={onClickModalWrapper}
        data-cy="modal"
      >
        <ModalActionsRow />
        <TooltipInfo />
        <ModalContainer style={{ ...screenParams }}>
          <OperatorPromptArea area={OPERATOR_PROMPT_AREAS.DRAWER_LEFT} />
          <ModalNavigation closePanels={closePanels} />
          <SpacesContainer>
            <ModalSpace />
          </SpacesContainer>
          <SidebarContainer>
            <SidebarPanelBlendInDiv />
            <Sidebar render={renderEntry} modal={true} />
          </SidebarContainer>
          <OperatorPromptArea area={OPERATOR_PROMPT_AREAS.DRAWER_RIGHT} />

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
        </ModalContainer>
      </ModalWrapper>
    </modalContext.Provider>,
    document.getElementById("modal") as HTMLDivElement
  );
};

export default React.memo(Modal);
