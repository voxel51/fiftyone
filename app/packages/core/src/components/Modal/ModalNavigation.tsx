import {
  LookerArrowLeftIcon,
  LookerArrowRightIcon,
} from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import React, { useCallback, useRef } from "react";
import { useRecoilValue, useRecoilValueLoadable } from "recoil";
import styled from "styled-components";

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
  background-color: var(--fo-palette-background-button);
  box-shadow: 0 1px 3px var(--fo-palette-custom-shadowDark);
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

const ModalNavigation = ({ onNavigate }: { onNavigate: () => void }) => {
  const [isNavigationHidden, setIsNavigationHidden] = React.useState(false);
  const countLoadable = useRecoilValueLoadable(
    fos.count({ path: "", extended: true, modal: false })
  );
  const count = useRef<number | null>(null);
  if (countLoadable.state === "hasValue") {
    count.current = countLoadable.contents;
  }

  const index = useRecoilValue(fos.modalSampleIndex);
  const setModal = fos.useSetExpandedSample();
  const clearModal = fos.useClearModal();

  const navigateNext = useCallback(() => {
    onNavigate();
    setModal((i) => i + 1);
  }, [onNavigate, setModal]);

  const navigatePrevious = useCallback(() => {
    onNavigate();
    setModal((i) => i - 1);
  }, [onNavigate, setModal]);

  const keyboardHandler = useCallback(
    (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active?.tagName === "INPUT") {
        if ((active as HTMLInputElement).type === "text") {
          return;
        }
      }
      if (e.key === "ArrowLeft") {
        navigatePrevious();
      } else if (e.key === "ArrowRight") {
        navigateNext();
      } else if (e.key === "c") {
        setIsNavigationHidden((prev) => !prev);
      } else if (e.key === "Escape") {
        clearModal();
      }
      // note: don't stop event propagation here
    },
    [navigateNext, navigatePrevious]
  );

  fos.useEventHandler(document, "keydown", keyboardHandler);

  return (
    <>
      {!isNavigationHidden && index > 0 && (
        <Arrow>
          <LookerArrowLeftIcon
            data-cy="nav-left-button"
            onClick={navigatePrevious}
          />
        </Arrow>
      )}
      {!isNavigationHidden && count.current && index < count.current - 1 && (
        <Arrow isRight>
          <LookerArrowRightIcon
            data-cy="nav-right-button"
            onClick={navigateNext}
          />
        </Arrow>
      )}
    </>
  );
};

export default ModalNavigation;
