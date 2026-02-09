import {
  LookerArrowLeftIcon,
  LookerArrowRightIcon,
} from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { useEffect, useRef } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import { KnownCommands, useCommand } from "@fiftyone/commands";
import React from "react";

const Arrow = styled.span<{
  $isRight?: boolean;
  $sidebarWidth: number;
  $isSidebarVisible: boolean;
}>`
  cursor: pointer;
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: space-between;
  right: ${(props) =>
    props.$isRight
      ? props.$isSidebarVisible
        ? `calc(0.75rem + ${props.$sidebarWidth}px)`
        : "0.75rem"
      : "initial"};
  left: ${(props) => (props.$isRight ? "initial" : "0.75rem")};
  z-index: 10000;
  padding: 0.75rem;
  top: 50%;
  width: 3rem;
  height: 3rem;
  background-color: var(--fo-palette-background-button);
  box-shadow: 0 1px 3px var(--fo-palette-custom-shadowDark);
  border-radius: 3px;
  opacity: 0.4;
  transition: opacity 0.15s ease-in-out;
  transition: box-shadow 0.15s ease-in-out;
  &:hover {
    opacity: 1;
    box-shadow: inherit;
    transition: box-shadow 0.15s ease-in-out;
    transition: opacity 0.15s ease-in-out;
  }

  &:active {
    top: calc(50% + 2px);
  }
`;

const ModalNavigation = () => {
  const showModalNavigationControls = useRecoilValue(
    fos.showModalNavigationControls
  );
  const sidebarwidth = useRecoilValue(fos.sidebarWidth(true));
  const isSidebarVisible = useRecoilValue(fos.sidebarVisible(true));

  const modal = useRecoilValue(fos.modalSelector);

  const modalRef = useRef(modal);
  useEffect(() => {
    modalRef.current = modal;
  }, [modal]);

  const { callback: next } = useCommand(KnownCommands.ModalNextSample);
  const { callback: previous } = useCommand(KnownCommands.ModalPreviousSample);

  if (!modal) {
    return null;
  }

  return (
    <>
      {showModalNavigationControls && modal.hasPrevious && (
        <Arrow
          $isSidebarVisible={isSidebarVisible}
          $sidebarWidth={sidebarwidth}
          onClick={previous}
        >
          <LookerArrowLeftIcon data-cy="nav-left-button" />
        </Arrow>
      )}
      {showModalNavigationControls && modal.hasNext && (
        <Arrow
          $isRight
          $isSidebarVisible={isSidebarVisible}
          $sidebarWidth={sidebarwidth}
          onClick={next}
        >
          <LookerArrowRightIcon data-cy="nav-right-button" />
        </Arrow>
      )}
    </>
  );
};

export default ModalNavigation;
