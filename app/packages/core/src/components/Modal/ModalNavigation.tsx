import {
  LookerArrowLeftIcon,
  LookerArrowRightIcon,
} from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useRecoilValue, useRecoilValueLoadable } from "recoil";
import styled from "styled-components";
import { createDebouncedNavigator } from "./debouncedNavigator";

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

const ModalNavigation = ({ closePanels }: { closePanels: () => void }) => {
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

  const modalRef = useRef(modal);

  modalRef.current = modal;

  // important: make sure all dependencies of the navigators are referentially stable,
  // or else the debouncing mechanism won't work
  const nextNavigator = useMemo(
    () =>
      createDebouncedNavigator({
        isNavigationIllegalWhen: () => modalRef.current?.hasNext === false,
        navigateFn: async (offset) => {
          const navigation = fos.modalNavigation.get();
          if (navigation) {
            return await navigation.next(offset).then(setModal);
          }
        },
        onNavigationStart: closePanels,
        debounceTime: 150,
      }),
    [closePanels, setModal]
  );

  const previousNavigator = useMemo(
    () =>
      createDebouncedNavigator({
        isNavigationIllegalWhen: () => modalRef.current?.hasPrevious === false,
        navigateFn: async (offset) => {
          const navigation = fos.modalNavigation.get();
          if (navigation) {
            return await navigation.previous(offset).then(setModal);
          }
        },
        onNavigationStart: closePanels,
        debounceTime: 150,
      }),
    [closePanels, setModal]
  );

  useEffect(() => {
    return () => {
      nextNavigator.cleanup();
      previousNavigator.cleanup();
    };
  }, [nextNavigator, previousNavigator]);

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
        previousNavigator.navigate();
      } else if (e.key === "ArrowRight") {
        nextNavigator.navigate();
      }
    },
    [nextNavigator, previousNavigator]
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
          onClick={previousNavigator.navigate}
        >
          <LookerArrowLeftIcon data-cy="nav-left-button" />
        </Arrow>
      )}
      {showModalNavigationControls && modal.hasNext && (
        <Arrow
          $isRight
          $isSidebarVisible={isSidebarVisible}
          $sidebarWidth={sidebarwidth}
          onClick={nextNavigator.navigate}
        >
          <LookerArrowRightIcon data-cy="nav-right-button" />
        </Arrow>
      )}
    </>
  );
};

export default ModalNavigation;
