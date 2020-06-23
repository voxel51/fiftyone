import React, { Suspense } from "react";
import styled from "styled-components";
import { useRecoilValue } from "recoil";

import { itemsPerRequest } from "../../state/atoms";
import { segmentItemIndices, segmentData } from "../../state/selectors";

const SegmentDiv = styled.div`
  width: 400px;
  height: 400px;
`;

const LoadingTile = styled.div`
  width: 100%;
  height: 80px;
  background: #ccc;
`;

const LoadingDiv = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr 1fr;
`;

export const Loading = () => {
  const itemsPerRequestValue = useRecoilValue(itemsPerRequest);
  return (
    <>
      {temsPerRequestValue.map((k) => (
        <LoadingTile />
      ))}
    </>
  );
};

const Segment = ({ index }) => {
  const itemIndicesValue = useRecoilValue(segmentItemIndices(index));
  const segmentDataValue = useRecoilValue(segmentData(index));

  return <SegmentDiv>Hello</SegmentDiv>;
};

export default ({ index }) => {
  return (
    <Suspense fallback={Loading}>
      <Segment index={index} />
    </Suspense>
  );
};
