import React, { useEffect, useLayoutEffect, useRef } from "react";
import styled from "styled-components";
import { useRecoilValue, useRecoilState, useSetRecoilState } from "recoil";

import {
  viewCount,
  isMainWidthResizing,
  mainLoaded,
  mainSize,
  destinationTop,
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
  const [destinationTopValue, setDestinationTop] = useRecoilState(
    destinationTop
  );

  const scrollRef = useRef(null);

  const [ref, { contentRect }] = useResizeObserver();
  useTrackMousePosition();
  useEffect(() => {
    setViewCount(50);
  }, []);

  useLayoutEffect(() => {
    if (!contentRect) return;
    let timeout = setTimeout(() => {
      setIsMainWidthResizing(false);
    }, 1000);
    const { top, width, height } = contentRect;
    let raf = requestAnimationFrame(() => {
      const s = width - 48 !== mainSizeValue[0] || height !== mainSizeValue[1];
      if (s) setMainSize([width - 48, height]);
      !mainLoadedValue && setMainLoaded(true);
    });
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
    };
  }, [ref, contentRect]);

  useEffect(() => {
    console.log(destinationTopValue, scrollRef.current);
    if (destinationTopValue && scrollRef.current) {
      setDestinationTop(null);
      setPreviousLayout(null);
      scrollRef.current.scrollTo({
        top: destinationTopValue,
        behavior: "auto",
      });
    }
  }, [destinationTopValue]);

  return (
    <Flashlight>
      <Container ref={ref}>
        <ListMain
          ref={scrollRef}
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
