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

const ColorModal = () => {
  const screen = { width: "30%", height: "30%" };
  const wrapperRef = useRef<HTMLDivElement>(null);
  const targetContainer = document.getElementById("colorModal");

  if (targetContainer) {
    return ReactDOM.createPortal(
      <Fragment>
        <ModalWrapper
          ref={wrapperRef}
          onClick={(event) => event.target === wrapperRef.current}
        >
          <Container style={{ ...screen, zIndex: 10001 }}>
            {/* <ContentColumn>
                    <ErrorBoundary onReset={() => {}}>
                     
                    </ErrorBoundary>
                  </ContentColumn> */}
            <div>this is the modal</div>
          </Container>
        </ModalWrapper>
      </Fragment>,
      targetContainer
    );
  } else {
    console.error("target container not found");
    return <></>;
  }
};

export default React.memo(ColorModal);
