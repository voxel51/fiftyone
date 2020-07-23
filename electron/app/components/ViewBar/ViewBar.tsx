import React from "react";
import styled from "styled-components";
import { useSpring } from "react-spring";
import { useMachine } from "@xstate/react";

import {
  white96 as backgroundColor,
  white85 as borderColor,
} from "../../shared/colors";
import { getSocket, useSubscribe } from "../../utils/socket";
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
  const [state, send] = useMachine(viewBarMachine);
  const socket = getSocket(5151, "state");

  useSubscribe(socket, "connect", (data) => {
    socket.emit("get_stages", "", (data) => {
      console.log(data);
    });
  });

  const { stages, tailStage } = state.context;

  return (
    <ViewBarDiv>
      {stages.map((stage) => (
        <ViewStage key={stage.id} stageRef={stage.ref} />
      ))}
      <ViewStage key={tailStage.id} stageRef={tailStage.ref} tailStage={true} />
    </ViewBarDiv>
  );
};
