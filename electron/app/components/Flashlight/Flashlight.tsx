import React, { useEffect, useLayoutEffect, useRef } from "react";
import styled from "styled-components";
import { useRecoilValue, useRecoilState, useSetRecoilState } from "recoil";
import { animated, useSpring } from "react-spring";
import { useWheel } from "react-use-gesture";

import {
  segmentIsLoaded,
  viewCount,
  isMainWidthResizing,
  mainPreviousWidth,
  mainTop,
  mainLoaded,
  mainSize,
  currentListTop,
  currentListHeight,
} from "../../state/atoms";
import { useTrackMousePosition, useResizeObserver } from "../../state/hooks";
import { segmentsToRender, currentListTopRange } from "../../state/selectors";

import Segment from "./Segment";
import Scrubber from "./Scrubber";

const Grid = styled.div`
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: 1fr 3rem;
`;

const Flashlight = styled.div`
  width: 100%;
  height: 100%;
`;

const ListContainer = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
`;

const ListDiv = animated(styled.div`
  position: absolute;
  width: 100%;
`);

const Items = styled.div`
  width: 100%;
  position: absolute;
`;

const List = ({ targetRef, children }) => {
  const setCurrentListHeight = useSetRecoilState(currentListHeight);
  const isMainWidthResizingValue = useRecoilValue(isMainWidthResizing);
  const currentListTopValue = useRecoilValue(currentListTop);
  const viewCountValue = useRecoilValue(viewCount);

  useEffect(() => {
    setCurrentListHeight(targetRef.current.offsetHeight);
  }, [targetRef.current, isMainWidthResizingValue]);

  const props = useSpring({
    top: -1 * currentListTopValue,
  });

  return (
    <ListDiv ref={targetRef} style={props}>
      {children}
    </ListDiv>
  );
};

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

  const [currentListTopValue, setCurrentListTop] = useRecoilState(
    currentListTop
  );
  const [minTop, maxTop] = useRecoilValue(currentListTopRange);

  const containerRef = useRef();
  const bind = useWheel((s) => {
    const {
      delta: [_, y],
    } = s;
    setCurrentListTop(
      Math.min(Math.max(currentListTopValue + y, minTop), maxTop)
    );
  });

  return (
    <Flashlight ref={ref}>
      <Grid>
        <ListContainer key={0} {...bind()} ref={containerRef}>
          {ref.current ? (
            <List targetRef={ref} containerRef={containerRef}>
              {segmentsToRenderValue.map((index) => (
                <Segment key={index} index={index} />
              ))}
            </List>
          ) : null}
        </ListContainer>
        <Scrubber key={1} targetRef={ref} />
      </Grid>
    </Flashlight>
  );
};
