import { Machine, assign, spawn, sendParent } from "xstate";
import uuid from "uuid-v4";

import viewStageParameterMachine from "./viewStageParameterMachine";

export const createParameter = (stage, parameter, value) => {
  return {
    id: uuid(),
    completed: false,
    parameter: parameter,
    stage: stage,
    value: value ? value : "",
  };
};

const viewStageMachine = Machine({
  id: "viewStage",
  context: {
    id: undefined,
    completed: false,
    stage: undefined,
    parameters: [],
    prevStage: "",
  },
  initial: "initializing",
  states: {
    initializing: {
      entry: assign({
        parameters: (ctx, e) => {
          return ctx.parameters.map((parameter) => ({
            ...parameter,
            ref: spawn(viewStageParameterMachine.withContext(parameter)),
          }));
        },
      }),
      on: {
        "": "reading",
      },
    },
    reading: {
      initial: "unknown",
      states: {
        unknown: {
          on: {
            "": [
              { target: "completed", cond: (ctx) => ctx.completed },
              { target: "pending" },
            ],
          },
        },
        pending: {
          on: {
            SET_COMPLETED: {
              target: "completed",
              actions: [
                assign({ completed: true }),
                sendParent((ctx) => ({ type: "STAGE.COMMIT", stage: ctx })),
              ],
            },
          },
        },
        completed: {
          on: {
            TOGGLE_COMPLETE: {
              target: "pending",
              actions: [
                assign({ completed: false }),
                sendParent((ctx) => ({ type: "STAGE.COMMIT", stage: ctx })),
              ],
            },
            SET_ACTIVE: {
              target: "pending",
              actions: [
                assign({ completed: false }),
                sendParent((ctx) => ({ type: "STAGE.COMMIT", stage: ctx })),
              ],
            },
          },
        },
        hist: {
          type: "history",
        },
      },
      on: {
        EDIT: {
          target: "editing",
          actions: "focusInput",
        },
      },
    },
    editing: {
      onEntry: assign({ prevStage: (ctx) => ctx.stage }),
      on: {
        CHANGE: {
          actions: assign({
            stage: (ctx, e) => e.stage,
          }),
        },
        COMMIT: [
          {
            target: "reading.hist",
            actions: sendParent((ctx) => ({
              type: "STAGE.COMMIT",
              stage: ctx,
            })),
            cond: (ctx) => ctx.stage.trim().length > 0,
          },
          { target: "deleted" },
        ],
        BLUR: {
          target: "reading",
          actions: sendParent((ctx) => ({ type: "STAGE.COMMIT", stage: ctx })),
        },
        CANCEL: {
          target: "reading",
          actions: assign({ stage: (ctx) => ctx.prevStage }),
        },
      },
    },
    deleted: {
      onEntry: sendParent((ctx) => ({ type: "STAGE.DELETE", id: ctx.id })),
    },
  },
  on: {
    "PARAMETER.COMMIT": {
      actions: [
        assign({
          parameters: (ctx, e) =>
            ctx.parameters.map((parameter) => {
              return parameter.id === e.parameter.id
                ? { ...parameter, ...e.parameter, ref: parameter.ref }
                : parameter;
            }),
        }),
      ],
    },
  },
});

export default viewStageMachine;
