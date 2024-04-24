import { useFont, useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { Leva as LevaOptions } from "leva";
import { useCallback, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRecoilValue } from "recoil";
import { LevaContainer } from "../containers";

const LEVA_CONTAINER_ID = "fo-leva-container";
const LEVA_POSITION_KEY = "fo-leva-container-position";

function Leva() {
  const theme = useTheme();
  const font = useFont();
  const isSidebarVisible = useRecoilValue(fos.sidebarVisible(true));
  const [isDragging, setIsDragging] = useState(false);

  const updateLevaContainerPosition = useCallback(
    (container: HTMLDivElement) => {
      const levaContainerRect = container.getBoundingClientRect();
      const levaContainerPosition = {
        x: levaContainerRect.x,
        y: levaContainerRect.y,
      };

      localStorage.setItem(
        LEVA_POSITION_KEY,
        JSON.stringify(levaContainerPosition)
      );
    },
    []
  );

  const mouseDownEventHandler = useCallback(() => {
    setIsDragging(true);

    const levaContainer = document.getElementById(LEVA_CONTAINER_ID)
      .firstElementChild as HTMLDivElement;

    updateLevaContainerPosition(levaContainer);
  }, [updateLevaContainerPosition]);

  const mouseMoveEventHandler = useCallback(() => {
    if (!isDragging) {
      return;
    }

    const levaContainer = document.getElementById(LEVA_CONTAINER_ID)
      .firstElementChild as HTMLDivElement;

    updateLevaContainerPosition(levaContainer);
  }, [isDragging, updateLevaContainerPosition]);

  const mouseUpEventHandler = useCallback(() => {
    if (!isDragging) {
      return;
    }

    setIsDragging(false);
  }, [isDragging]);

  // this effect adds event listeners to the leva container header to handle dragging
  useLayoutEffect(() => {
    const levaParentContainer = document.getElementById(LEVA_CONTAINER_ID);

    if (!levaParentContainer) {
      return;
    }

    const levaContainer =
      levaParentContainer.firstElementChild as HTMLDivElement;
    const levaContainerHeader =
      levaContainer.firstElementChild as HTMLDivElement;

    levaContainerHeader.addEventListener("mousedown", mouseDownEventHandler);
    levaContainerHeader.addEventListener("mouseup", mouseUpEventHandler);
    levaContainerHeader.addEventListener("mousemove", mouseMoveEventHandler);

    return () => {
      levaContainerHeader.removeEventListener(
        "mousedown",
        mouseDownEventHandler
      );
      levaContainerHeader.removeEventListener("mouseup", mouseUpEventHandler);
      levaContainerHeader.removeEventListener(
        "mousemove",
        mouseMoveEventHandler
      );
    };
  }, [mouseMoveEventHandler, mouseUpEventHandler, mouseDownEventHandler]);

  // this effect syncs the position of the leva container with the local storage on component mount
  useLayoutEffect(() => {
    const levaParentContainer = document.getElementById(LEVA_CONTAINER_ID);

    if (!levaParentContainer) {
      return;
    }

    // restore from local storage
    const levaPosition = localStorage.getItem(LEVA_POSITION_KEY);
    if (levaPosition) {
      const { x, y } = JSON.parse(levaPosition);
      levaParentContainer.style.left = `${x}px`;
      levaParentContainer.style.right = "unset";
      levaParentContainer.style.top = `${y}px`;
    }
  }, []);

  const [isLevaCollapsed, setIsLevaCollapsed] = fos.useBrowserStorage(
    "fo-is-leva-collapsed",
    false
  );

  return (
    <>
      {createPortal(
        <LevaContainer
          isSidebarVisible={isSidebarVisible}
          id={LEVA_CONTAINER_ID}
        >
          <LevaOptions
            theme={{
              colors: {
                accent1: theme.primary.main,
                accent2: theme.primary.main,
                accent3: theme.background.default,

                elevation1: theme.background.level3,
                elevation2: theme.background.level1,
                elevation3: theme.background.level2,

                highlight1: theme.text.secondary,
                highlight2: theme.text.secondary,
                highlight3: theme.text.primary,

                folderWidgetColor: theme.primary.main,
              },

              fonts: {
                mono: font,
                sans: font,
              },
            }}
            fill
            hideCopyButton
            flat
            collapsed={{
              collapsed: isLevaCollapsed,
              onChange: setIsLevaCollapsed,
            }}
          />
        </LevaContainer>,
        document.getElementById("modal")
      )}
    </>
  );
}

export default Leva;
