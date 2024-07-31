import { OPERATOR_PROMPT_AREAS, OperatorPromptArea } from "@fiftyone/operators";
import { SpaceNodeJSON, usePanels, useSpaces } from "@fiftyone/spaces";
import { Space } from "@fiftyone/spaces/src/components";
import * as fos from "@fiftyone/state";
import React, { useCallback, useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import Sidebar from "../Sidebar";
import { NoOpModalContentPluginActivation } from "./ModalContentPlugin";
import { TooltipInfo } from "./TooltipInfo";
import { useModalSidebarRenderEntry } from "./use-sidebar-render-entry";

NoOpModalContentPluginActivation();

export const MODAL_SPACES_ID = "fo-space-modal";

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
`;

const SpacesContainer = styled.div`
  width: 100%;
  height: 100%;
  margin-top: 5px;
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

  const panelsPredicate = useCallback(
    (panel) => panel.surfaces === "modal" || panel.surfaces === "grid modal",
    []
  );

  const allModalPlugins = usePanels(panelsPredicate);

  const defaultModalSpaces = useMemo(() => {
    return {
      id: "root",
      children: allModalPlugins.map((modalPlugin) => ({
        id: `${modalPlugin.name}`,
        type: modalPlugin.name,
        children: [],
        ...modalPlugin.panelOptions,
      })),
      type: "panel-container",
      // `SampleModal` is the default modal plugin registered in `ModalContentPlugin.tsx`
      activeChild: "SampleModal",
    } as SpaceNodeJSON;
  }, [allModalPlugins]);

  const { spaces } = useSpaces(MODAL_SPACES_ID, defaultModalSpaces);

  return ReactDOM.createPortal(
    <ModalWrapper ref={wrapperRef} onClick={onClickModalWrapper}>
      <ModalContainer
        style={{ ...screenParams, zIndex: 10001 }}
        data-cy="modal"
      >
        <OperatorPromptArea area={OPERATOR_PROMPT_AREAS.DRAWER_LEFT} />
        <TooltipInfo />
        <SpacesContainer>
          <Space node={spaces.root} id={MODAL_SPACES_ID} type="modal" />
        </SpacesContainer>
        <Sidebar render={renderEntry} modal={true} />
        <OperatorPromptArea area={OPERATOR_PROMPT_AREAS.DRAWER_RIGHT} />
      </ModalContainer>
    </ModalWrapper>,
    document.getElementById("modal") as HTMLDivElement
  );
};

export default React.memo(Modal);
