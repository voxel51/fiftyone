import {
  LookerArrowLeftIcon,
  LookerArrowRightIcon,
} from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import React, { useCallback, useEffect, useRef } from "react";
import { useRecoilValue, useRecoilValueLoadable } from "recoil";
import styled from "styled-components";

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
  z-index: 99999;
  padding: 0.75rem;
  bottom: 33vh;
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
`;

const ModalNavigation = ({ onNavigate }: { onNavigate: () => void }) => {
  const showModalNavigationControls = useRecoilValue(
    fos.showModalNavigationControls
  );

  const sidebarwidth = useRecoilValue(fos.sidebarWidth(true));
  const isSidebarVisible = useRecoilValue(fos.sidebarVisible(true));

  const countLoadable = useRecoilValueLoadable(
    fos.count({ path: "", extended: true, modal: false })
  );
  const count = useRef<number | null>(null);
  if (countLoadable.state === "hasValue") {
    count.current = countLoadable.contents;
  }

  const setModal = fos.useSetExpandedSample();
  const modal = useRecoilValue(fos.modalSelector);
  const navigation = useRecoilValue(fos.modalNavigation);

  const nextTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const accumulatedNextOffsetRef = useRef(0);

  const previousTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const accumulatedPreviousOffsetRef = useRef(0);

  const modalRef = useRef(modal);

  modalRef.current = modal;

  const navigateNext = useCallback(() => {
    if (!modalRef.current?.hasNext) {
      return;
    }

    if (!nextTimeoutRef.current) {
      // First click: navigate immediately
      onNavigate();
      navigation?.next(1).then(setModal);
      accumulatedNextOffsetRef.current = 0;
      console.log(">!>Immediate next execution");
    } else {
      // Subsequent clicks: accumulate offset
      accumulatedNextOffsetRef.current += 1;
      console.log(">!>Debouncing next");
    }

    // Reset debounce timer
    if (nextTimeoutRef.current) {
      clearTimeout(nextTimeoutRef.current);
    }

    nextTimeoutRef.current = setTimeout(() => {
      if (accumulatedNextOffsetRef.current > 0) {
        onNavigate();
        navigation?.next(accumulatedNextOffsetRef.current).then(setModal);
        accumulatedNextOffsetRef.current = 0;
      }
      nextTimeoutRef.current = null;
    }, 200);
  }, [navigation, onNavigate, setModal]);

  const navigatePrevious = useCallback(() => {
    if (!modalRef.current?.hasPrevious) {
      return;
    }

    if (!previousTimeoutRef.current) {
      // First click: navigate immediately
      onNavigate();
      navigation?.previous(1).then(setModal);
      accumulatedPreviousOffsetRef.current = 0;
      console.log(">!>Immediate previous execution");
    } else {
      // Subsequent clicks: accumulate offset
      accumulatedPreviousOffsetRef.current += 1;
      console.log(">!>Debouncing previous");
    }

    // Reset debounce timer
    if (previousTimeoutRef.current) {
      clearTimeout(previousTimeoutRef.current);
    }

    previousTimeoutRef.current = setTimeout(() => {
      if (accumulatedPreviousOffsetRef.current > 0) {
        onNavigate();
        navigation
          ?.previous(accumulatedPreviousOffsetRef.current)
          .then(setModal);
        accumulatedPreviousOffsetRef.current = 0;
      }
      previousTimeoutRef.current = null;
    }, 200);
  }, [navigation, onNavigate, setModal]);

  useEffect(() => {
    return () => {
      if (nextTimeoutRef.current) {
        clearTimeout(nextTimeoutRef.current);
      }
      if (previousTimeoutRef.current) {
        clearTimeout(previousTimeoutRef.current);
      }
    };
  }, []);

  const keyboardHandler = useCallback(
    (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active?.tagName === "INPUT") {
        if ((active as HTMLInputElement).type === "text") {
          return;
        }
      }

      if (e.altKey || e.ctrlKey || e.metaKey) {
        return;
      }

      if (e.key === "ArrowLeft") {
        navigatePrevious();
      } else if (e.key === "ArrowRight") {
        navigateNext();
      }
    },
    [navigateNext, navigatePrevious]
  );

  fos.useEventHandler(document, "keyup", keyboardHandler);

  if (!modal) {
    return null;
  }

  return (
    <>
      {showModalNavigationControls && modal.hasPrevious && (
        <Arrow
          $isSidebarVisible={isSidebarVisible}
          $sidebarWidth={sidebarwidth}
          onClick={navigatePrevious}
        >
          <LookerArrowLeftIcon data-cy="nav-left-button" />
        </Arrow>
      )}
      {showModalNavigationControls && modal.hasNext && (
        <Arrow
          $isRight
          $isSidebarVisible={isSidebarVisible}
          $sidebarWidth={sidebarwidth}
          onClick={navigateNext}
        >
          <LookerArrowRightIcon data-cy="nav-right-button" />
          <div>oi</div>
          {accumulatedNextOffsetRef.current > 0 && (
            <div>{accumulatedNextOffsetRef.current}</div>
          )}
        </Arrow>
      )}
    </>
  );
};

export default ModalNavigation;
