import React, { Suspense } from "react";
import styled from "styled-components";
import { useRecoilValue } from "recoil";
import { animated, useSpring } from "react-spring";

import { Item } from "../Player51";

import { mainLoaded } from "../../../state/atoms";
import {
  itemsToRenderInSegment,
  segmentBaseSize,
} from "../../../state/selectors";

const SegmentDiv = animated(styled.div`
  position: relative;
`);

const Segment = ({ index }) => {
  const itemsToRenderInSegmentValue = useRecoilValue(
    itemsToRenderInSegment(index)
  );
  const segmentBaseSizeValue = useRecoilValue(segmentBaseSize(index));

  const props = useSpring({
    ...segmentBaseSizeValue,
  });

  return (
    <SegmentDiv style={props}>
      {itemsToRenderInSegmentValue.map(({ key, index }) => (
        <Item key={key} index={index} />
      ))}
    </SegmentDiv>
  );
};

export default ({ index }) => {
  return <Segment index={index} />;
};
