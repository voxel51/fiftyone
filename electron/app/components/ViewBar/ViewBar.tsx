import React from "react";
import styled from "styled-components";
import { useSpring } from "react-spring";
import { useMachine } from "@xstate/react";
import { useRecoilValue } from "recoil";

import {
  white96 as backgroundColor,
  white85 as borderColor,
} from "../../shared/colors";
import { port } from "../../recoil/atoms";
import { getSocket, useSubscribe } from "../../utils/socket";
import ViewStage, { AddViewStage } from "./ViewStage/ViewStage";
import viewBarMachine, { createBar } from "./viewBarMachine";

const ViewBarDiv = styled.div`
  background-color: ${backgroundColor};
  border-radius: 3px;
  border: 1px solid ${borderColor};
  box-sizing: border-box;
  height: 54px;
  width: 100%;
  padding: 0 0.25rem;
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

const machine = viewBarMachine.withContext(createBar(5151));

export default () => {
  const [state] = useMachine(machine);

  const { stages, tailStage } = state.context;

  const tail = () =>
    stages.length ? (
      <AddViewStage key={`insert-button-${tailStage.id}`} />
    ) : (
      <ViewStage key={tailStage.id} stageRef={tailStage.ref} tailStage={true} />
    );

  return (
    <ViewBarDiv>
      {state.matches("running")
        ? stages.map((stage, i) => {
            return (
              <>
                <AddViewStage
                  key={`insert-button-${stage.id}`}
                  send={send}
                  insertAt={i}
                />
                <ViewStage key={stage.id} stageRef={stage.ref} />
              </>
            );
          })
        : null}
      {state.matches("running") ? tail() : null}
    </ViewBarDiv>
  );
};
