import React from "react";
import styled from "styled-components";
import { useSpring } from "react-spring";

import { useRecoilValue } from "recoil";
import { viewStages } from "../../recoil/selectors";
import ViewStage from "./ViewStage/ViewStage";

import viewBarMachine from "./viewBarMachine";

const ViewBarDiv = styled.div`
  background-color: #f4f4f4;
  border-radius: 3px;
  border: 1px solid #d8d8d8;
  box-sizing: border-box;
  width: 100%;
`;

/*const connectedViewBarMachine = viewBarMachine.withConfig(
  {
    actions: {
      submit: (ctx) => {
        // ...
      },
    },
  },
  // load view from recoil
  {
    stage: 
  }
);*/

export default () => {
  // const tailIndex = stages.length;
  return (
    <ViewBarDiv>
      <ViewStage index={0} key={0} />
    </ViewBarDiv>
  );
};
