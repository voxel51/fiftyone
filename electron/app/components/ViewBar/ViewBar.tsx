import React from "react";
import styled from "styled-components";
import { useSpring } from "react-spring";

import {
  white96 as backgroundColor,
  white85 as borderColor,
} from "../../shared/colors";

import ViewStage from "./ViewStage/ViewStage";
import viewBarMachine from "./viewBarMachine";

const ViewBarDiv = styled.div`
  background-color: ${backgroundColor};
  border-radius: 3px;
  border: 1px solid ${borderColor};
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
