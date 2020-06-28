import React, { useEffect, useLayoutEffect, useRef } from "react";
import styled from "styled-components";
import { useRecoilValue, useRecoilState, useSetRecoilState } from "recoil";
import { animated, useSpring } from "react-spring";
import { useWheel } from "react-use-gesture";

import {
  segmentIsLoaded,
  viewCount,
  isMainWidthResizing,
  mainTop,
  mainLoaded,
  mainSize,
  currentListTop,
} from "../../state/atoms";
import { useTrackMousePosition, useResizeObserver } from "../../state/hooks";
import {
  segmentsToRender,
  currentListTopRange,
  currentListHeight,
} from "../../state/selectors";

import Segment from "./Segment";
import Scrubber from "./Scrubber";

const Grid = styled.div`
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: 1fr 3rem;
`;

const Flashlight = styled.div`
  display: block;
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

const List = ({ children }) => {
  const ref = useRef();
  const setCurrentListHeight = useSetRecoilState(currentListHeight);
  const isMainWidthResizingValue = useRecoilValue(isMainWidthResizing);
  const currentListTopValue = useRecoilValue(currentListTop);
  const viewCountValue = useRecoilValue(viewCount);

  const props = useSpring({
    top: -1 * currentListTopValue,
  });

  return (
    <ListDiv ref={ref} style={props}>
      {children}
    </ListDiv>
  );
};

const ListMain = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
`;

let timeout;

export default () => {
  const segmentsToRenderValue = useRecoilValue(segmentsToRender);

  useTrackMousePosition();
  const setIsMainWidthResizing = useSetRecoilState(isMainWidthResizing);
  const [mainSizeValue, setMainSize] = useRecoilState(mainSize);
  const setMainTop = useSetRecoilState(mainTop);
  const [mainLoadedValue, setMainLoaded] = useRecoilState(mainLoaded);
  const [ref, { contentRect }] = useResizeObserver();
  const [currentListTopValue, setCurrentListTop] = useRecoilState(
    currentListTop
  );
  const [minTop, maxTop] = useRecoilValue(currentListTopRange);

  const setViewCount = useSetRecoilState(viewCount);
  useEffect(() => {
    setViewCount(200);
  }, []);

  useLayoutEffect(() => {
    if (!contentRect) return;
    const { top, width, height } = contentRect;
    requestAnimationFrame(() => {
      setIsMainWidthResizing(width !== mainSizeValue[0]);
      setMainSize([width, height]);
      setMainTop(top);
      !mainLoadedValue && setMainLoaded(true);
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        setIsMainWidthResizing(false);
      }, 1000);
    });
  }, [ref, contentRect]);

  const bind = useWheel((s) => {
    const {
      delta: [_, y],
    } = s;

    setCurrentListTop(
      Math.min(Math.max(currentListTopValue + y, minTop), maxTop)
    );
  });

  return (
    <Flashlight>
      <Grid>
        <ListMain ref={ref}>
          <ListContainer {...bind()}>
            {mainLoadedValue ? (
              <List>
                {segmentsToRenderValue.map((index) => (
                  <Segment key={index} index={index} />
                ))}
              </List>
            ) : null}
          </ListContainer>
        </ListMain>
        <Scrubber />
      </Grid>
    </Flashlight>
  );
};
