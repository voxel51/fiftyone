import React, { Suspense } from "react";
import styled from "styled-components";
import { useRecoilValue, useRecoilState } from "recoil";

import { Item } from "../Player51";

import { segmentIsLoaded } from "../../../state/atoms";
import { itemsToRenderInSegment, segmentData } from "../../../state/selectors";

const SegmentDiv = styled.div`
  position: absolute;
  contain: layout;
  transform: translateZ(0);
  width: 100%;
`;

const Segment = ({ index }) => {
  const itemsToRenderInSegmentValue = useRecoilValue(
    itemsToRenderInSegment(index)
  );

  return (
    <SegmentDiv style={{ top: 0 }}>
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
