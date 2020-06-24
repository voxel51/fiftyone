import React, { Suspense } from "react";
import styled from "styled-components";
import { useRecoilValue } from "recoil";

import { Item } from "../Player51";

import { itemsPerRequest } from "../../state/atoms";
import { segmentItemIndices, segmentData } from "../../state/selectors";

const SegmentDiv = styled.div`
  position: relative;
  width: 400px;
  height: 400px;
`;

const LoadingTile = styled.div`
  width: 100%;
  height: 120px;
  background: #ccc;
`;

const Spacer = styled.div`
  width: 100%;
  height: 120px;
`;

const Loading = ({ index }) => {
  const itemsIndicesValue = useRecoilValue(segmentItemIndices(index));
  return (
    <LoadingDiv>
      {itemsIndicesValue.map((k) => (
        <>
          <Spacer className="spacer" key={`spacer-${k}`} />
          <LoadingTile key={k} />
        </>
      ))}
      <Spacer key="end-row" />
    </LoadingDiv>
  );
};

const Segment = ({ index }) => {
  const itemIndicesValue = useRecoilValue(segmentItemIndices(index));

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
