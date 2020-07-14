import React from "react";
import styled from "styled-components";
import { useSpring } from "react-spring";
import { useRecoilValue } from "recoil";
import { viewStages } from "../../recoil/selectors";
import ViewStage from "./ViewStage/ViewStage";

const ViewBar = styled.div`
  background-color: var(--bg);
  border-radius: 0.2rem;
  border: 0.2rem solid var(--std-border-color);
  box-sizing: border-box;
  height: 3rem;
  line-height: 3rem;
  width: 100%;
`;

export default () => {
  const stages = useRecoilValue(viewStages);
  return (
    <ViewBar>
      {stages.length ? (
        stages.map((stage, i) => {
          return <ViewStage empty={false} key={i} />;
        })
      ) : (
        <ViewStage empty={true} key={0} />
      )}
    </ViewBar>
  );
};
