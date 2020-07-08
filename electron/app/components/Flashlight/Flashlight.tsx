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
  firstBase,
  secondBase,
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
  currentLayout,
} from "../../state/selectors";

import Scrubber from "./Scrubber";
import { Item } from "./Player51";

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

const Manager = React.memo(({ index }) => {
  return (
    <Suspense fallback={<></>}>
      <Loader index={index} />
    </Suspense>
  );
});

const ScrollListener = ({ scrollRef, setFirst, setSecond }) => {
  useScrollListener(scrollRef, setFirst, setSecond);
  return null;
};

const Segment = ({ layout: { y, height }, children }) => {
  return <SegmentDiv style={{ y, height }}>{children}</SegmentDiv>;
};

const Subscriber = () => {
  const segmentsToRenderValue = useRecoilValue(segmentsToRender);
  useRecoilValue(currentLayout);
  return (
    <>
      {segmentsToRenderValue.map((i) => (
        <Manager key={i} index={i} />
      ))}
    </>
  );
};

export default () => {
  const setIsMainWidthResizing = useSetRecoilState(isMainWidthResizing);
  const [mainSizeValue, setMainSize] = useRecoilState(mainSize);
  const currentListHeightValue = useRecoilValue(currentListHeight);
  const [mainLoadedValue, setMainLoaded] = useRecoilState(mainLoaded);

  const [viewCountValue, setViewCount] = useRecoilState(viewCount);
  const itemsPerRequestValue = useRecoilValue(itemsPerRequest);
  const scrollRef = useRef();
  const firstBaseValue = useRecoilValue(firstBase);
  const secondBaseValue = useRecoilValue(secondBase);

  const [ref, { contentRect }] = useResizeObserver();
  useTrackMousePosition();
  useEffect(() => {
    setViewCount(200);
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
    y: firstBaseValue.y,
    height: firstBaseValue.height,
    config: { duration: 0 },
  }));
  const [second, setSecond] = useSpring(() => ({
    y: secondBaseValue.y,
    height: secondBaseValue.height,
    config: { duration: 0 },
  }));

  return (
    <>
      <Flashlight>
        <Container ref={ref}>
          <ListMain ref={scrollRef}>
            <ListContainer style={{ height: currentListHeightValue }}>
              <Segment layout={first}>
                {[
                  ...Array(
                    Math.min(viewCountValue, itemsPerRequestValue)
                  ).keys(),
                ].map((i) => (
                  <Item key={i} index={i} />
                ))}
              </Segment>
              <Segment layout={second}>
                {[
                  ...Array(
                    Math.max(viewCountValue - itemsPerRequestValue, 0)
                  ).keys(),
                ].map((i) => (
                  <Item key={i} index={i + itemsPerRequestValue} />
                ))}
              </Segment>
            </ListContainer>
          </ListMain>
          <Scrubber />
        </Container>
      </Flashlight>
      <Subscriber />
      <ScrollListener
        scrollRef={scrollRef}
        setFirst={setFirst}
        setSecond={setSecond}
      />
    </>
  );
};
