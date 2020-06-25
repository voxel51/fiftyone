import React, { Suspense } from "react";
import styled from "styled-components";
import { useRecoilValue } from "recoil";

import { Item } from "../Player51";

import { mainLoaded } from "../../state/atoms";
import { segmentItemIndices } from "../../state/selectors";

const SegmentDiv = styled.div`
  position: relative;
  width: 400px;
  height: 400px;
`;

const Segment = ({ index }) => {
  const itemIndicesValue = useRecoilValue(segmentItemIndices(index));
  const mainLoadedValue = useRecoilValue(mainLoaded);

  if (!mainLoadedValue) return null;

  return (
    <SegmentDiv>
      {itemIndicesValue.map((key, index) => (
        <Item key={key} index={index} />
      ))}
    </SegmentDiv>
  );
};

export default ({ index }) => {
  return <Segment index={index} />;
};
