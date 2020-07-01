import React, { useEffect, useLayoutEffect, useRef } from "react";
import styled from "styled-components";
import { useRecoilValue, useRecoilState, useSetRecoilState } from "recoil";

import {
  viewCount,
  isMainWidthResizing,
  mainTop,
  mainLoaded,
  mainSize,
  previousMainSize,
  liveTop,
  previousLayout,
} from "../../state/atoms";
import { useTrackMousePosition, useResizeObserver } from "../../state/hooks";
import {
  segmentsToRender,
  currentListHeight,
  currentLayout,
} from "../../state/selectors";

import Segment from "./Segment";
import Scrubber from "./Scrubber";

const Container = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
`;

const Flashlight = styled.div`
  display: block;
  width: 100%;
  height: 100%;
`;

const ListContainer = styled.div`
  position: relative;
  width: 100%;
`;

const ListMain = styled.div`
  position: relative;
  flex: 1;
  height: 100%;
  overflow-x: hidden;
  overflow-y: scroll;
  will-change: transform;

  ::-webkit-scrollbar {
    width: 0px;
    background: transparent;
  }
`;

export default () => {
  const segmentsToRenderValue = useRecoilValue(segmentsToRender);
  const setIsMainWidthResizing = useSetRecoilState(isMainWidthResizing);
  const [mainSizeValue, setMainSize] = useRecoilState(mainSize);
  const currentListHeightValue = useRecoilValue(currentListHeight);
  const [mainLoadedValue, setMainLoaded] = useRecoilState(mainLoaded);
  const setLiveTop = useSetRecoilState(liveTop);
  const setViewCount = useSetRecoilState(viewCount);
  const currentLayoutValue = useRecoilValue(currentLayout);
  const setPreviousLayout = useSetRecoilState(previousLayout);

  const [ref, { contentRect }] = useResizeObserver();
  useTrackMousePosition();
  useEffect(() => {
    setViewCount(100);
  }, []);

  useLayoutEffect(() => {
    if (!contentRect) return;
    let timeout = setTimeout(() => {
      setIsMainWidthResizing(false);
    }, 1000);
    const { top, width, height } = contentRect;
    let raf = requestAnimationFrame(() => {
      // setIsMainWidthResizing(width !== mainSizeValue[0]);
      const s = width !== mainSizeValue[0] || height !== mainSizeValue[1];
      if (s) setMainSize([width, height]);
      !mainLoadedValue && setMainLoaded(true);
    });
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
    };
  }, [ref, contentRect]);

  return (
    <Flashlight>
      <Container>
        <ListMain
          ref={ref}
          onScroll={(e) => {
            setLiveTop(e.target.scrollTop);
            setPreviousLayout(currentLayoutValue);
          }}
        >
          <ListContainer style={{ height: currentListHeightValue }}>
            {mainLoadedValue
              ? segmentsToRenderValue.map((index) => (
                  <Segment key={index} index={index} />
                ))
              : null}
          </ListContainer>
        </ListMain>
        <Scrubber />
      </Container>
    </Flashlight>
  );
};
