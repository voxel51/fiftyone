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

const Segment = ({ index }) => {
  const itemsToRenderInSegmentValue = useRecoilValue(
    itemsToRenderInSegment(index)
  );
  const top = useRecoilValue(segmentTop(index));
  const { y } = useSpring({
    y: top,
    config: {
      duration: 0,
    },
  });

  return (
    <SegmentDiv
      style={{ transform: interpolate([y], (y) => `translate3d(0,${y}px,0)`) }}
    >
      {itemsToRenderInSegmentValue.map(({ key, index }) => (
        <Item key={key} index={index} />
      ))}
    </SegmentDiv>
  );
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
      <Segment index={index} />
      <Suspense fallback={<></>}>
        <Loader index={index} />
      </Suspense>
    </>
  );
};
