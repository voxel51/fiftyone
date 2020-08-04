import React from "react";
import styled from "styled-components";
import { useSpring } from "react-spring";
import { useMachine } from "@xstate/react";
import { useRecoilValue } from "recoil";

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

const ViewBar = () => {
  const [state, send] = useMachine(machine);

  const { stages } = state.context;

  return (
    <ViewBarDiv>
      {state.matches("running")
        ? stages.map((stage, i) => {
            return (
              <React.Fragment key={stage.id}>
                {stage.submitted && (i === 0 || stages[i - 1].submitted) ? (
                  <AddViewStage
                    key={`insert-button-${stage.id}`}
                    send={send}
                    index={i}
                  />
                ) : null}
                <ViewStage key={stage.id} stageRef={stage.ref} />
              </React.Fragment>
            );
          })
        : null}
      {state.matches("running") && stages[stages.length - 1].submitted ? (
        <AddViewStage
          key={`insert-button-tail`}
          send={send}
          index={stages.length}
        />
      ) : null}
    </ViewBarDiv>
  );
};

export default ViewBar;
