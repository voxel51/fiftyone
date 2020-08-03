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
  background-color: ${({ theme }) => theme.backgroundDark};
  border-radius: 3px;
  border: 1px solid ${({ theme }) => theme.backgroundDarkBorder};
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
  const [state, send] = useMachine(machine);

  const { stages } = state.context;

  return (
    <ViewBarDiv>
      {state.matches("running")
        ? stages.map((stage, i) => {
            return (
              <>
                {stage.stage.insertAt === undefined ? (
                  <AddViewStage
                    key={`insert-button-${stage.id}`}
                    send={send}
                    insertAt={i}
                  />
                ) : null}
                <ViewStage key={stage.id} stageRef={stage.ref} />
              </>
            );
          })
        : null}
    </ViewBarDiv>
  );
};
