import React, { Suspense, useEffect, useLayoutEffect, useRef } from "react";
import { animated, useSpring, useSprings } from "react-spring";
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
  useSetter,
} from "../../state/hooks";
import {
  currentListHeight,
  segmentsToRender,
  segmentData,
  currentLayout,
} from "../../state/selectors";

import Scrubber from "./Scrubber";
import { Item } from "./Player51";

class Processor {
  constructor(containerSize, itemsPerRequest, margin, socket, rootIndex = 0) {
    this.containerWidth = containerSize[0];
    this.containerHeight = containerSize[1];
    this.itemsPerRequest = itemsPerRequest;
    this.margin = margin;
    this.rootIndex = rootIndex;
    this.socket = socket;

    this.baseNumCols = this.getBaseNumCols(this.containerWidth);
    this.baseItemSize = this.getBaseItemSize(this.containerWidth, this.margin);

    this._segmentItemIndicesStore = {};
    this._itemRowCache = {};
  }

  get currentIndex() {
    const top = get(liveTop);
    const root = get(rootIndex);
    const rootTop = get(topFromIndex(root));
    const numItemsInSegment = get(itemsPerRequest);
    const margin = get(gridMargin);
    const [viewPortWidth, unused] = get(mainSize);
    let currentTop = rootTop;
    let index = root;
    let segmentIndex;
    let segmentLayout;
    let row;
    while (currentTop < top) {
      segmentIndex = get(segmentIndexFromItemIndex(index));
      segmentLayout = get(segmentLayoutCache(segmentIndex));
      if (segmentLayout && segmentLayout.top + segmentLayout.height > top) {
        row = get(itemRowCache((segmentIndex + 1) * numItemsInSegment - 1));
        index = row[row.length - 1] + 1;
        currentTop = segmentLayout.top + segmentLayout.height;
      } else {
        row = get(itemRow({ startIndex: index, viewPortWidth })).data;
        index = row[row.length - 1].index + 1;
        currentTop += row[0].height + margin;
      }
    }
    return index;
  }

  set currentIndex(index) {
    this.rootIndex = index;
  }

  static getBaseNumCols(containerWidth) {
    if (containerWidth <= 600) {
      return 2;
    } else if (containerWidth < 768) {
      return 3;
    } else if (containerWidth < 992) {
      return 4;
    } else if (containerWidth < 1200) {
      return 5;
    } else {
      return 7;
    }
  }

  static getbaseItemSize(baseNumCols, containerWidth, margin) {
    const size = (containerWidth - (baseNumCols + 1) * margin) / baseNumCols;
    return {
      width: size,
      height: size,
    };
  }

  static getSegmentIndexFromItemIndex(itemIndex, itemsPerRequest) {
    return Math.floor(itemIndex / itemsPerRequest);
  }

  getTopFromIndex(index) {
    index = index in this._itemRowCache ? this._ItemRowCache[index] : index;
    return (
      Math.max(0, Math.floor(index / this.baseNumCols) - 1) *
      (this.baseItemSize.height + this.margin)
    );
  }

  getSegmentItemIndices(segmentIndex) {
    if (segmentIndex in this._segmentItemIndicesStore) {
      return this._segmentItemIndicesStore[segmentIndex];
    }
    const start = segmentIndex * this.itemsPerRequest;
    this._segmentItemIndicesStore[segmentIndex] = [
      ...Array(this.itemsPerRequest).keys(),
    ].map((i) => start + i);

    return this._segmentItemIndicesStore[segmentIndex];
  }
}

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

const Setter = ({
  setFirstSpring,
  setFirstSprings,
  setSecondSpring,
  setSecondSprings,
}) => {
  useSetter(setFirstSpring, setSecondSpring);
  return null;
};

const ScrollListener = ({ scrollRef }) => {
  useScrollListener(scrollRef);
  return null;
};

const Segment = ({ layout: { y, height }, children }) => {
  return <SegmentDiv style={{ y, height }}>{children}</SegmentDiv>;
};

const Subscriber = () => {
  const segmentsToRenderValue = useRecoilValue(segmentsToRender);
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

  const [firstSpring, setFirstSpring] = useSpring(() => ({
    y: firstBaseValue.y,
    height: firstBaseValue.height,
    config: { duration: 0 },
  }));

  const [firstSprings, setFirstSprings] = useSprings(
    Math.min(viewCountValue, itemsPerRequestValue),
    (index) => firstBaseValue.items[index]
  );

  const [secondSpring, setSecondSpring] = useSpring(() => ({
    y: secondBaseValue.y,
    height: secondBaseValue.height,
    config: { duration: 0 },
  }));

  const [secondSprings, setSecondSprings] = useSprings(
    Math.max(viewCountValue - itemsPerRequestValue, 0),
    (index) => secondBaseValue.items[index]
  );

  return (
    <>
      <Flashlight>
        <Container ref={ref}>
          <ListMain ref={scrollRef}>
            <ListContainer style={{ height: currentListHeightValue }}>
              <Segment layout={firstSpring}>
                {firstSprings.map((layout, i) => (
                  <Item key={i} index={i} layout={layout} />
                ))}
              </Segment>
              <Segment layout={secondSpring}>
                {secondSprings.map((layout, i) => (
                  <Item
                    key={i}
                    index={i + itemsPerRequestValue}
                    layout={layout}
                  />
                ))}
              </Segment>
            </ListContainer>
          </ListMain>
          <Scrubber />
        </Container>
      </Flashlight>
      <Subscriber />
      <ScrollListener scrollRef={scrollRef} />
      <Setter
        setFirstSpring={setFirstSpring}
        setFirstSprings={setFirstSprings}
        setSecondSpring={setSecondSpring}
        setSecondSprings={setSecondSprings}
      />
    </>
  );
};
