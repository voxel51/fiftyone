import React from "react";
import { assign, Machine, spawn } from "xstate";
import { useMachine } from "@xstate/react";

import { createStage } from "../viewBarMachine";
import viewStageMachine from "./viewStageMachine";
import ViewBar from "../ViewBar";
import ViewStage from "./ViewStage";

export default {
  component: ViewStage,
  title: "ViewBar/ViewStage",
};

const spawnStage = () => {
  return spawn(viewStageMachine.withContext(createStage("limit")));
};

const dumbyViewBarMachine = Machine({
  id: "dumbyViewBar",
  initial: "start",
  context: {
    stageRef: undefined,
  },
  states: {
    start: {
      entry: assign({
        stageRef: () => spawnStage(),
      }),
    },
  },
});

export const standard = () => (
  <ViewBar>
    <ViewStage />
  </ViewBar>
);
