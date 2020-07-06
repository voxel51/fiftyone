import React, { useEffect, useLayoutEffect, useRef } from "react";
import styled from "styled-components";
import { useRecoilValue, useRecoilState, useSetRecoilState } from "recoil";

import {
  viewCount,
  isMainWidthResizing,
  mainLoaded,
  mainSize,
  previousSegmentsToRender,
} from "../../state/atoms";
import {
  useTrackMousePosition,
  useResizeObserver,
  useScrollListener,
} from "../../state/hooks";
import { currentListHeight, segmentsToRender } from "../../state/selectors";

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
  position: absolute;
  width: 100%;
  transform: translateZ(0);
  top: 0;
  left: 0;
  contain: layout;
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

const ScrollListener = ({ scrollRef }) => {
  useScrollListener(scrollRef);
  return null;
};

const SegmentsDiv = styled.div`
  width: 100%;
  height: 100%;
  position: relative;
`;

const Segments = React.memo(
  ({ segments }) => {
    console.log(segments);
    return (
      <SegmentsDiv>
        {segments.map((index) => (
          <Segment key={index} index={index} />
        ))}
      </SegmentsDiv>
    );
  },
  ({ segments: prev }, { segments: next }) => {
    if (prev.length !== next.length) return false;

    if (prev.length === 0) return true;

    const length = prev.length;

    if (prev[0] === next[0] && prev[length - 1] === next[length - 1]) {
      return true;
    }

    return false;
  }
);

const SegmentsManager = () => {
  const segmentsToRenderValue = useRecoilValue(segmentsToRender);
  const mainLoadedValue = useRecoilValue(mainLoaded);
  if (!mainLoadedValue) return null;

  return <Segments segments={segmentsToRenderValue} />;
};

export default () => {
  const setIsMainWidthResizing = useSetRecoilState(isMainWidthResizing);
  const [mainSizeValue, setMainSize] = useRecoilState(mainSize);
  const currentListHeightValue = useRecoilValue(currentListHeight);
  const [mainLoadedValue, setMainLoaded] = useRecoilState(mainLoaded);

  const setViewCount = useSetRecoilState(viewCount);
  const scrollRef = useRef();

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

  return (
    <>
      <Flashlight>
        <Container ref={ref}>
          <ListMain ref={scrollRef}>
            <ListContainer style={{ height: currentListHeightValue }}>
              <SegmentsManager />
            </ListContainer>
          </ListMain>
          <Scrubber />
        </Container>
      </Flashlight>
      <ScrollListener scrollRef={scrollRef} />
    </>
  );
};
