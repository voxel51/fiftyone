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

export const standard = () => {
  return <React.Fragment></React.Fragment>;
};
