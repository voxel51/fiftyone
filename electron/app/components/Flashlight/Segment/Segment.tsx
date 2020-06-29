import React, { Suspense } from "react";
import styled from "styled-components";
import { useRecoilValue } from "recoil";

import { Item } from "../Player51";

import {
  itemsToRenderInSegment,
  segmentBaseSize,
  segmentTop,
} from "../../../state/selectors";

const SegmentDiv = styled.div`
  position: absolute;
  contain: layout;
`;

const Segment = ({ index }) => {
  const itemsToRenderInSegmentValue = useRecoilValue(
    itemsToRenderInSegment(index)
  );
  const segmentTopValue = useRecoilValue(segmentTop(index));
  const segmentBaseSizeValue = useRecoilValue(segmentBaseSize(index));

  return (
    <SegmentDiv style={{ ...segmentBaseSizeValue, top: segmentTopValue }}>
      {itemsToRenderInSegmentValue.map(({ key, index }) => (
        <Item key={key} index={index} />
      ))}
    </SegmentDiv>
  );
};

export default ({ index }) => {
  return <Segment index={index} />;
};
