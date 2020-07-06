import React, { Suspense } from "react";
import styled from "styled-components";
import { useRecoilValue, useRecoilState } from "recoil";
import { animated, interpolate, useSpring } from "react-spring";

import { Item } from "../Player51";

import { segmentIsLoaded } from "../../../state/atoms";
import {
  itemsToRenderInSegment,
  segmentData,
  segmentTop,
} from "../../../state/selectors";

const SegmentDiv = animated(styled.div`
  position: absolute;
  contain: layout;
  transform: will-change;
  transition: none 0s ease 0s;
  width: 100%;
`);

const Segment = React.memo(
  ({ items, top }) => {
    return (
      <SegmentDiv style={{ transform: `translate3d(0,${top}px,0)` }}>
        {items.map(({ key, index }) => (
          <Item key={key} index={index} />
        ))}
      </SegmentDiv>
    );
  },
  (prev, next) => {
    if (prev.items.length !== next.items.length) return false;

    if (prev.items.length === 0) return true;

    const length = prev.items.length;

    if (
      prev.items[0].index === next.items[0].index &&
      prev.items[length - 1].index === next.items[length - 1].index
    ) {
      return true;
    }

    return false;
  }
);

const SegmentManager = ({ index }) => {
  const itemsToRenderInSegmentValue = useRecoilValue(
    itemsToRenderInSegment(index)
  );
  const top = useRecoilValue(segmentTop(index));

  return <Segment items={itemsToRenderInSegmentValue} top={top} />;
};

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

export default ({ index }) => {
  return (
    <>
      <SegmentManager index={index} />
      <Suspense fallback={<></>}>
        <Loader index={index} />
      </Suspense>
    </>
  );
};
