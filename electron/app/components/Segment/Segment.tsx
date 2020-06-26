import React, { Suspense } from "react";
import styled from "styled-components";
import { useRecoilValue } from "recoil";

import { Item } from "../Player51";

import { mainLoaded } from "../../state/atoms";
import { itemsToRenderInSegment } from "../../state/selectors";

const SegmentDiv = styled.div`
  position: relative;
  width: 400px;
  height: 400px;
`;

const Segment = ({ index }) => {
  const itemsToRenderInSegmentValue = useRecoilValue(
    itemsToRenderInSegment(index)
  );
  const mainLoadedValue = useRecoilValue(mainLoaded);

  if (!mainLoadedValue) return null;

  return (
    <SegmentDiv>
      {itemsToRenderInSegmentValue.map((unused, { key, index }) => (
        <Item key={key} index={index} />
      ))}
    </SegmentDiv>
  );
};

export default ({ index }) => {
  return <Segment index={index} />;
};
