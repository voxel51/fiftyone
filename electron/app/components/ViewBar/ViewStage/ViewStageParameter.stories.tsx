import React from "react";
import { spawn } from "xstate";

import "../../../app.global.css";
import { createParameter } from "./viewStageMachine";
import ViewStageParameter from "./ViewStageParameter";
import viewStageParameterMachine from "./viewStageParameterMachine";

export default {
  component: ViewStageParameter,
  title: "ViewBar/ViewStageParameter",
};

const makeMachine = () => {
  return spawn(
    viewStageParameterMachine.withContext(
      createParameter("limit", "limit", undefined)
    )
  );
};

export const standard = () => {
  const parameterRef = makeMachine();
  console.log(parameterRef);
  return <ViewStageParameter parameterRef={parameterRef} />;
};
