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

export default ({ index }) => {
  return <Segment index={index} />;
};
