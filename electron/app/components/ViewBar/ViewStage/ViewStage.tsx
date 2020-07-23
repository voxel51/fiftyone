import React, { useState } from "react";
import styled from "styled-components";
import { animated, useSpring } from "react-spring";
import { useRecoilValue } from "recoil";
import { useMachine } from "@xstate/react";

import { viewStages } from "../../../recoil/atoms";
import { numViewStages } from "../../../recoil/selectors";
import SearchResults from "./SearchResults";

const ViewStageDiv = animated(styled.div`
  box-sizing: border-box;
  height: 32px;
  border: 1px dashed #6c757d;
  border-radius: 3px;
  background-color: rgba(108, 117, 125, 0.13);
  display: inline-block;
`);

const ViewStageInput = styled.input`
  background-color: transparent;
  border: none;

  :focus {
    boder: none;
    outline: none;
  }
`;

export default ({ index, stageRef }) => {
  // const [state, send] = useMachine(stageRef);
  const isActive = useState(false);

  const props = useSpring({
    borderStyle: isActive ? "dashed" : "solid",
  });

  return (
    <ViewStageDiv style={props}>
      <ViewStageInput />
    </ViewStageDiv>
  );
};
