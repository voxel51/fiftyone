import React, { useEffect, useRef, useLayoutEffect } from "react";
import { action } from "@storybook/addon-actions";
import _ from "lodash";
import styled from "styled-components";
import { useSetRecoilState, useRecoilState } from "recoil";

import {
  viewCount,
  mainTop,
  mainSize,
  mainPreviousWidth,
  mainLoaded,
  isMainWidthResizing,
  segmentIsLoaded,
} from "../state/atoms";
import { useTrackMousePosition, useResizeObserver } from "../state/hooks";

const StyledContainer = styled.div`
  width: 100%;
  height: 100%;
`;

let timeout;

export const Container = ({ children }) => {
  useTrackMousePosition();
  const setSegmentIsLoaded = useSetRecoilState(segmentIsLoaded(0));
  const [isMainWidthResizingValue, setIsMainWidthResizing] = useRecoilState(
    isMainWidthResizing
  );
  const [mainSizeValue, setMainSize] = useRecoilState(mainSize);
  const [mainPreviousWidthValue, setMainPreviousWidth] = useRecoilState(
    mainPreviousWidth
  );
  const setMainTop = useSetRecoilState(mainTop);
  const [mainLoadedValue, setMainLoaded] = useRecoilState(mainLoaded);
  const [ref, { contentRect }] = useResizeObserver();

  const setViewCount = useSetRecoilState(viewCount);
  useEffect(() => {
    setViewCount(50);
  }, []);

  useLayoutEffect(() => {
    if (!contentRect) return;
    const { top, width, height } = contentRect;

    requestAnimationFrame(() => {
      setIsMainWidthResizing(width !== mainSizeValue[0]);
      setMainSize([width, height]);
      setMainPreviousWidth(mainSizeValue[0]);
      setMainTop(top);
      !mainLoadedValue && setMainLoaded(true);
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        setIsMainWidthResizing(false);
      }, 1000);
    });
  }, [contentRect]);

  return <StyledContainer ref={ref}>{children}</StyledContainer>;
};
