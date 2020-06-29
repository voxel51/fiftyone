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
  liveTop,
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
  const [liveTopValue, setLiveTop] = useRecoilState(liveTop);

  let hotTop = ref.current;
  if (hotTop && hotTop.offsetTop !== undefined) hotTop = hotTop.offsetTop;

  useLayoutEffect(() => {
    const dod = () => hotTop !== undefined && setLiveTop(hotTop);
    let t = requestAnimationFrame(dod);

    return () => cancelAnimationFrame(t);
  }, [hotTop]);

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

  useTrackMousePosition();
  const setIsMainWidthResizing = useSetRecoilState(isMainWidthResizing);
  const [mainSizeValue, setMainSize] = useRecoilState(mainSize);
  const currentListHeightValue = useRecoilValue(currentListHeight);
  const setMainTop = useSetRecoilState(mainTop);
  const [mainLoadedValue, setMainLoaded] = useRecoilState(mainLoaded);
  const [ref, { contentRect }] = useResizeObserver();
  const [currentListTopValue, setCurrentListTop] = useRecoilState(
    currentListTop
  );
  const [liveTopValue, setLiveTop] = useRecoilState(liveTop);
  const [minTop, maxTop] = useRecoilValue(currentListTopRange);

  const setViewCount = useSetRecoilState(viewCount);
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
      setIsMainWidthResizing(width !== mainSizeValue[0]);
      setMainSize([width, height]);
      setMainTop(top);
      !mainLoadedValue && setMainLoaded(true);
    });
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
    };
  }, [ref, contentRect]);

  return (
    <Flashlight>
      <Grid>
        <ListMain
          ref={ref}
          onScroll={(e) => setLiveTop(-1 * e.target.scrollTop)}
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
      </Grid>
    </Flashlight>
  );
};
