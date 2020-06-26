import React, { useEffect, useLayoutEffect } from "react";
import styled from "styled-components";
import { useRecoilValue, useRecoilState, useSetRecoilState } from "recoil";

import {
  segmentIsLoaded,
  viewCount,
  isMainWidthResizing,
  mainPreviousWidth,
  mainTop,
  mainLoaded,
  mainSize,
} from "../../state/atoms";
import { useTrackMousePosition, useResizeObserver } from "../../state/hooks";
import { segmentsToRender } from "../../state/selectors";

import { Segment } from "../Segment";

const Flashlight = styled.div`
  width: 100%;
  height: 100%;
`;

let timeout;

export default () => {
  const segmentsToRenderValue = useRecoilValue(segmentsToRender);

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

  return (
    <Flashlight ref={ref}>
      {segmentsToRenderValue.map((unused, index) => {
        <Segment index={index} />;
      })}
    </Flashlight>
  );
};
