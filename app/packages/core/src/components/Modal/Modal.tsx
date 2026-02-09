import {
  useAutoSave,
  useRegisterAnnotationCommandHandlers,
  useRegisterAnnotationEventHandlers,
  useRegisterRendererEventHandlers,
} from "@fiftyone/annotation";
import { HelpPanel, JSONPanel } from "@fiftyone/components";
import { selectiveRenderingEventBus } from "@fiftyone/looker";
import { OPERATOR_PROMPT_AREAS, OperatorPromptArea } from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import { ModalMode, useModalMode } from "@fiftyone/state";
import {
  currentModalUniqueIdJotaiAtom,
  jotaiStore,
} from "@fiftyone/state/src/jotai";
import React, { Fragment, useCallback, useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import { useRecoilCallback, useRecoilValue } from "recoil";
import styled from "styled-components";
import Actions from "./Actions";
import ModalNavigation from "./ModalNavigation";
import { ModalSpace } from "./ModalSpace";
import { Sidebar } from "./Sidebar";
import { TooltipInfo } from "./TooltipInfo";
import { useLookerHelpers, useTooltipEventHandler } from "./hooks";
import { modalContext } from "./modal-context";
import { CommandContextActivator, KnownContexts } from "@fiftyone/commands";
import { useModalCommands } from "./useModalCommands";

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

const ModalCommandHandlersRegistration = ({
  modalCloseHandler,
}: {
  modalCloseHandler: () => Promise<void>;
}) => {
  useRegisterAnnotationCommandHandlers();
  useRegisterAnnotationEventHandlers();
  useRegisterRendererEventHandlers();
  useModalCommands(modalCloseHandler);
  const modalMode = useModalMode();

  useAutoSave(modalMode === ModalMode.ANNOTATE);

  return <Fragment />;
};

const Modal = () => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const pointerDownTargetRef = useRef<EventTarget | null>(null);

  const clearModal = fos.useClearModal();

  const onPointerDownModalWrapper = useCallback((e: React.PointerEvent) => {
    // Track where the pointer down started
    pointerDownTargetRef.current = e.target;
  }, []);

  const onClickModalWrapper = useCallback(
    (e: React.MouseEvent) => {
      // Only close if both pointer down and pointer up happened on the wrapper
      if (
        e.target === wrapperRef.current &&
        pointerDownTargetRef.current === wrapperRef.current
      ) {
        clearModal();
      }
      // Reset the tracked target
      pointerDownTargetRef.current = null;
    },
    [clearModal]
  );

  const { jsonPanel, helpPanel } = useLookerHelpers();

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

        selectiveRenderingEventBus.removeAllListeners();

        jotaiStore.set(currentModalUniqueIdJotaiAtom, "");
      },
    [clearModal, jsonPanel, helpPanel]
  );

  const isFullScreen = useRecoilValue(fos.fullscreen);

  const screenParams = useMemo(() => {
    return isFullScreen
      ? { width: "100%", height: "100%" }
      : { width: "95%", height: "calc(100% - 70px)", borderRadius: "8px" };
  }, [isFullScreen]);

  const activeLookerRef = useRef<fos.Lookers>();

  const addTooltipEventHandler = useTooltipEventHandler();
  const removeTooltipEventHanlderRef = useRef<ReturnType<
    typeof addTooltipEventHandler
  > | null>(null);

  const onLookerSet = useRecoilCallback(
    ({ snapshot }) =>
      (looker: fos.Lookers) => {
        looker.addEventListener("close", modalCloseHandler);

        // remove previous event listener
        removeTooltipEventHanlderRef.current?.();
        removeTooltipEventHanlderRef.current = addTooltipEventHandler(looker);

        // set the current modal unique id
        jotaiStore.set(
          currentModalUniqueIdJotaiAtom,
          `${snapshot.getLoadable(fos.groupId).getValue()}-${snapshot
            .getLoadable(fos.nullableModalSampleId)
            .getValue()}`
        );
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

  const isSidebarVisible = useRecoilValue(fos.sidebarVisible(true));

  return ReactDOM.createPortal(
    <modalContext.Provider
      value={{
        activeLookerRef,
        setActiveLookerRef,
      }}
    >
      <ModalWrapper
        ref={wrapperRef}
        onPointerDown={onPointerDownModalWrapper}
        onClick={onClickModalWrapper}
        data-cy="modal"
      >
        <CommandContextActivator id={KnownContexts.Modal}>
          <Actions />
          <ModalCommandHandlersRegistration
            modalCloseHandler={modalCloseHandler}
          />
          <TooltipInfo />
          <ModalContainer style={{ ...screenParams }}>
            <OperatorPromptArea area={OPERATOR_PROMPT_AREAS.DRAWER_LEFT} />
            <ModalNavigation />
            <SpacesContainer>
              <ModalSpace />
            </SpacesContainer>
            {isSidebarVisible && <Sidebar />}
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
        </CommandContextActivator>
      </ModalWrapper>
    </modalContext.Provider>,
    document.getElementById("modal") as HTMLDivElement
  );
};

export default React.memo(Modal);
