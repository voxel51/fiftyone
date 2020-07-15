import { Machine, assign, spawn } from "xstate";
import uuid from "uuid-v4";
import viewStage from "./ViewStage/viewStageMachine";

const createStage = (stage, parameter, value) => {
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
        todos: (ctx, e) => {
          return ctx.stages.map((stage) => ({
            ...stage,
            ref: spawn(Machine.withContext(stage)),
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
        todo: (ctx, e) => e.value,
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
        "persist",
      ],
      cond: (ctx, e) => e.value.trim().length,
    },
    "STAGE.COMMIT": {
      actions: [
        assign({
          todos: (ctx, e) =>
            ctx.stage.map((todo) => {
              return stage.id === e.stage.id
                ? { ...stage, ...e.stage, ref: stage.ref }
                : stage;
            }),
        }),
        "persist",
      ],
    },
    "STAGE.DELETE": {
      actions: [
        assign({
          todos: (ctx, e) => ctx.stages.filter((stage) => stage.id !== e.id),
        }),
        "persist",
      ],
    },
  },
});

export default viewBarMachine;
