import { Machine, assign, spawn } from "xstate";
import uuid from "uuid-v4";
import viewStageMachine from "./ViewStage/viewStageMachine";

export const createStage = (stage) => {
  return {
    id: uuid(),
    completed: false,
    stage: undefined,
  };
};

const viewBarMachine = Machine({
  id: "stages",
  context: {
    stage: "", // tail stage
    stages: [],
  },
  initial: "initializing",
  states: {
    initializing: {
      entry: assign({
        stages: (ctx, e) => {
          return ctx.stages.map((stage) => ({
            ...stage,
            ref: spawn(viewStageMachine.withContext(stage)),
          }));
        },
      }),
      on: {
        "": "all",
      },
    },
    all: {},
    active: {},
    completed: {},
  },
  on: {
    "NEWSTAGE.CHANGE": {
      actions: assign({
        stage: (ctx, e) => e.value,
      }),
    },
    "NEWSTAGE.COMMIT": {
      actions: [
        assign({
          stage: "", // clear tail stage
          stages: (ctx, e) => {
            const newStage = createStage(e.value.trim());
            return ctx.stages.concat({
              ...newStage,
              ref: spawn(viewStageMachine.withContext(newStage)),
            });
          },
        }),
        "submit",
      ],
      cond: (ctx, e) => e.value.trim().length,
    },
    "STAGE.COMMIT": {
      actions: [
        assign({
          stages: (ctx, e) =>
            ctx.stage.map((stage) => {
              return stage.id === e.stage.id
                ? { ...stage, ...e.stage, ref: stage.ref }
                : stage;
            }),
        }),
        "submit",
      ],
    },
    "STAGE.DELETE": {
      actions: [
        assign({
          stages: (ctx, e) => ctx.stages.filter((stage) => stage.id !== e.id),
        }),
        "submit",
      ],
    },
  },
});

export default viewBarMachine;
