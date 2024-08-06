import { OPERATOR_PROMPT_AREAS, OperatorPromptArea } from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import React, { useCallback, useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import { ModalActionsRow } from "../Actions";
import Sidebar from "../Sidebar";
import { ModalSpace } from "./ModalSpace";
import { TooltipInfo } from "./TooltipInfo";
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

  const isFullScreen = useRecoilValue(fos.fullscreen);

  const screenParams = useMemo(() => {
    return isFullScreen
      ? { width: "100%", height: "100%" }
      : { width: "95%", height: "90%", borderRadius: "3px" };
  }, [isFullScreen]);

  const activeLookerRef = useRef<fos.Lookers>();

  const onLookerSetSubscribers = useRef<((looker: fos.Lookers) => void)[]>([]);

  const onLookerSet = useCallback((looker: fos.Lookers) => {
    onLookerSetSubscribers.current.forEach((sub) => sub(looker));
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
          <SpacesContainer>
            <ModalSpace />
          </SpacesContainer>
          <SidebarContainer>
            <SidebarPanelBlendInDiv />
            <Sidebar render={renderEntry} modal={true} />
          </SidebarContainer>
          <OperatorPromptArea area={OPERATOR_PROMPT_AREAS.DRAWER_RIGHT} />
        </ModalContainer>
      </ModalWrapper>
    </modalContext.Provider>,
    document.getElementById("modal") as HTMLDivElement
  );
};

export default React.memo(Modal);
