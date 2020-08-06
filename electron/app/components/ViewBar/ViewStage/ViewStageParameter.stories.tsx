import React from "react";
import { assign, Machine, spawn } from "xstate";
import { useMachine } from "@xstate/react";

import { createParameter } from "./viewStageMachine";
import ViewStageParameter from "./ViewStageParameter";
import viewStageParameterMachine from "./viewStageParameterMachine";

export default {
  component: ViewStageParameter,
  title: "ViewBar/ViewStageParameter",
};

const spawnParameter = () => {
  return spawn(
    viewStageParameterMachine.withContext(
      createParameter("limit", "limit", undefined)
    )
  );
};

const dumbyViewStageMachine = Machine({
  id: "dumbyViewStage",
  initial: "start",
  context: {
    parameterRef: undefined,
  },
  states: {
    start: {
      entry: assign({
        parameterRef: () => spawnParameter(),
      }),
    },
  },
});

export const standard = () => {
  const [current] = useMachine(dumbyViewStageMachine);
  return <ViewStageParameter parameterRef={current.context.parameterRef} />;
};
