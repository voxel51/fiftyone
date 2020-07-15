import React, { useState } from "react";
import styled from "styled-components";
import { animated, useSpring } from "react-spring";
import { useRecoilValue } from "recoil";
import { useMachine } from "@xstate/react";

import { viewStages } from "../../../recoil/atoms";
import { numViewStages } from "../../../recoil/selectors";
import SearchResults from "./SearchResults";

const ViewStageDiv = animated(styled.div`
  background-color: var(--bg);
  border-color: var(--std-border-color);
  border-radius: var(--std-border-radius);
  border-width: var(--std-border-width);
  box-sizing: border-box;
  display: inline-block;
  line-height: 1.5rem;
  margin: 0.25rem;
  padding: 0 0.5rem;
`);

export default ({ index, stageRef }) => {
  const [state, send] = useMachine(stageRef);
  const numViewStagesValue = useRecoilValue(numViewStages);
  const viewStagesValue = useRecoilValue(viewStages);
  const isActive = useState(false);

  const props = useSpring({
    borderStyle: isActive ? "dashed" : "solid",
  });

  return (
    <ViewStageDiv style={props}>
      {numViewStagesValue === index ? <div>empty</div> : <div>populated</div>}
    </ViewStageDiv>
  );
};
