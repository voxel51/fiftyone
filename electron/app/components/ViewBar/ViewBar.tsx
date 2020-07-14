import React from "react";
import styled from "styled-components";
import { useSpring } from "react-spring";

import { useRecoilValue } from "recoil";
import { viewStages } from "../../recoil/selectors";
import ViewStage from "./ViewStage/ViewStage";

const ViewBarDiv = styled.div`
  background-color: var(--bg);
  border-radius: var(--std-border-radius);
  border: var(--std-border-width) solid var(--std-border-color);
  box-sizing: border-box;
  width: 100%;
`;

export default () => {
  const stages = useRecoilValue(viewStages);
  return (
    <ViewBarDiv>
      {stages.map((stage, i) => {
        return <ViewStage key={i} />;
      })}
      <ViewStage empty={true} key={stages.length + 1} />
    </ViewBarDiv>
  );
};
