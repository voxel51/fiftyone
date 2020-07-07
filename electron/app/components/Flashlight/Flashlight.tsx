import React, { Suspense, useEffect, useLayoutEffect, useRef } from "react";
import { animated, useSpring } from "react-spring";
import { useWheel } from "react-use-gesture";
import styled from "styled-components";
import { useRecoilValue, useRecoilState, useSetRecoilState } from "recoil";

import {
  viewCount,
  isMainWidthResizing,
  mainLoaded,
  mainSize,
  firstBaseLayout,
  secondBaseLayout,
  segmentIsLoaded,
  itemsPerRequest,
} from "../../state/atoms";
import {
  useTrackMousePosition,
  useResizeObserver,
  useScrollListener,
} from "../../state/hooks";
import {
  currentListHeight,
  segmentsToRender,
  segmentData,
} from "../../state/selectors";

import Scrubber from "./Scrubber";
import Item from "./Player51";

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

const SegmentDiv = animated(styled.div`
  position: absolute;
  contain: layout;
  transform: will-change;
  transition: none 0s ease 0s;
  width: 100%;
`);

const Loader = ({ index }) => {
  useRecoilValue(segmentData(index));
  const [segmentIsLoadedValue, setSegmentIsLoaded] = useRecoilState(
    segmentIsLoaded(index)
  );

  if (!segmentIsLoadedValue) {
    setSegmentIsLoaded(true);
  }
  return null;
};

const SegmentsManager = () => {
  const segmentsToRenderValue = useRecoilValue(segmentsToRender);

  return (
    <>
      {segmentsToRenderValue.map((index) => (
        <Suspense fallback={<></>}>
          <Loader index={index} />
        </Suspense>
      ))}
    </>
  );
};

const ScrollListener = ({ scrollRef }) => {
  useScrollListener(scrollRef);
  return <SegmentsManager />;
};

const Segment = ({ layout, children }) => {
  return <SegmentDiv style={layout}>{children}</SegmentDiv>;
};

const FirstBase = ({ layout }) => {
  const numItems = useRecoilValue(itemsPerRequest);
  const count = useRecoilValue(viewCount);

  const items = [...Array(Math.min(count, numItems)).keys()];
  return (
    <Segment layout={layout}>
      {items.map((i) => (
        <Item index={i} />
      ))}
    </Segment>
  );
};

const SecondBase = ({ layout }) => {
  const numItems = useRecoilValue(itemsPerRequest);
  const count = useRecoilValue(viewCount);

  const items = [...Array(Math.max(0, count - numItems)).keys()];
  return (
    <Segment layout={layout}>
      {items.map((i) => (
        <Item index={i + numItems} />
      ))}
    </Segment>
  );
};

export default () => {
  const setIsMainWidthResizing = useSetRecoilState(isMainWidthResizing);
  const [mainSizeValue, setMainSize] = useRecoilState(mainSize);
  const currentListHeightValue = useRecoilValue(currentListHeight);
  const [mainLoadedValue, setMainLoaded] = useRecoilState(mainLoaded);

  const setViewCount = useSetRecoilState(viewCount);
  const scrollRef = useRef();
  const firstBaseLayoutValue = useRecoilValue(firstBaseLayout);
  const secondBaseLayoutValue = useRecoilValue(secondBaseLayout);

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

  const [first, setFirst] = useSpring(() => ({
    ...firstBaseLayoutValue,
    config: { duration: 0 },
  }));
  const [second, setSecond] = useSpring(() => ({
    ...secondBaseLayoutValue,
    config: { duration: 0 },
  }));

  const bind = useWheel((s) => {
    setFirst(firstBaseLayoutValue);
    setSecond(secondBaseLayoutValue);
  });

  return (
    <>
      <Flashlight {...bind()}>
        <Container ref={ref}>
          <ListMain ref={scrollRef}>
            <ListContainer style={{ height: currentListHeightValue }}>
              <FirstBase layout={first} />
              <SecondBase layout={second} />
            </ListContainer>
          </ListMain>
          <Scrubber />
        </Container>
      </Flashlight>
      <ScrollListener scrollRef={scrollRef} />
    </>
  );
};
