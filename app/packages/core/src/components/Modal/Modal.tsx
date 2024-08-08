import { HelpPanel, JSONPanel } from "@fiftyone/components";
import { OPERATOR_PROMPT_AREAS, OperatorPromptArea } from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import { useRecoilCallback, useRecoilValue } from "recoil";
import styled from "styled-components";
import { ModalActionsRow } from "../Actions";
import Sidebar from "../Sidebar";
import { useLookerHelpers } from "./hooks";
import { modalContext } from "./modal-context";
import ModalNavigation from "./ModalNavigation";
import { ModalSpace } from "./ModalSpace";
import { TooltipInfo } from "./TooltipInfo";
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

const ModalNavigationContainer = styled.div<{ sidebarwidth: number }>`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: ${({ sidebarwidth }) =>
    sidebarwidth ? `calc(100% - ${sidebarwidth}px)` : "100%"};
  height: 100%;
  position: absolute;
  left: 0;
`;

const SpacesContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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

  const { jsonPanel, helpPanel, onNavigate } = useLookerHelpers();

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

        if (e.key === "s") {
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
          } else {
            await modalCloseHandler();
          }
        }
      },
    []
  );

  fos.useEventHandler(document, "keyup", keysHandler);

  const isFullScreen = useRecoilValue(fos.fullscreen);
  const sidebarwidth = useRecoilValue(fos.sidebarWidth(true));

  const screenParams = useMemo(() => {
    return isFullScreen
      ? { width: "100%", height: "100%" }
      : { width: "95%", height: "90%", borderRadius: "3px" };
  }, [isFullScreen]);

  const activeLookerRef = useRef<fos.Lookers>();

  // this is so that other components can add event listeners to the active looker
  const onLookerSetSubscribers = useRef<((looker: fos.Lookers) => void)[]>([]);

  const onLookerSet = useCallback((looker: fos.Lookers) => {
    onLookerSetSubscribers.current.forEach((sub) => sub(looker));

    looker.addEventListener("close", modalCloseHandler);
  }, []);

  // cleanup effect
  useEffect(() => {
    return () => {
      activeLookerRef.current?.removeEventListener("close", modalCloseHandler);
    };
  }, []);

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
        onLookerSetSubscribers,
      }}
    >
      <ModalActionsRow />
      <ModalWrapper ref={wrapperRef} onClick={onClickModalWrapper}>
        <TooltipInfo />
        <ModalContainer style={{ ...screenParams }} data-cy="modal">
          <OperatorPromptArea area={OPERATOR_PROMPT_AREAS.DRAWER_LEFT} />
          <ModalNavigationContainer sidebarwidth={sidebarwidth}>
            <ModalNavigation onNavigate={onNavigate} />
          </ModalNavigationContainer>
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
