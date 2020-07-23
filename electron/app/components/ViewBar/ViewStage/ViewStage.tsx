import React, { useState } from "react";
import styled from "styled-components";
import { animated, useSpring } from "react-spring";
import { useRecoilValue } from "recoil";
import { useService } from "@xstate/react";

import { grey46 as fontColor } from "../../../shared/colors";
import SearchResults from "./SearchResults";

const ViewStageDiv = animated(styled.div`
  box-sizing: border-box;
  border: 1px dashed #6c757d;
  border-radius: 3px;
  background-color: rgba(108, 117, 125, 0.13);
  display: inline-block;
  margin: 0.5rem;
  max-width: 7.5rem;
`);

const ViewStageInput = styled.input`
  background-color: transparent;
  border: none;
  line-height: 1rem;
  margin: 0.5rem;
  width: auto;
  color: ${fontColor};

  :focus {
    boder: none;
    outline: none;
  }
`;

const ViewStageButton = styled.button``;

export default React.memo(({ stageRef, tailStage }) => {
  const [state, send] = useService(stageRef);

  const props = useSpring({
    borderStyle: true ? "dashed" : "solid",
  });

  return (
    <ViewStageDiv style={props}>
      <div>
        {tailStage ? (
          <ViewStageInput placeholder="+ search sample" />
        ) : (
          <ViewStageButton />
        )}
      </div>
    </ViewStageDiv>
  );
});
