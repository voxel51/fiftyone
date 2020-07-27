import { Machine, assign, spawn, sendParent } from "xstate";
import uuid from "uuid-v4";

import viewStageParameterMachine from "./viewStageParameterMachine";

export const createParameter = (stage, parameter, type, value) => {
  return {
    id: uuid(),
    completed: false,
    parameter: parameter,
    type: type,
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
    stageInfo: undefined,
  },
  initial: "initializing",
  states: {
    initializing: {
      entry: assign({
        parameters: (ctx) => {
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
          entry: assign({
            parameters: (ctx) => {
              const parameters = ctx.stageInfo
                .filter((s) => s.name.lowerCase().includes(ctx.stage))[0]
                .params.map((parameter) =>
                  createParameter(ctx.stage, parameter.name, parameter.type, "")
                );
              return parameters.map((parameter) => ({
                ...parameter,
                ref: spawn(viewStageParameterMachine.withContext(parameter)),
              }));
            },
          }),
        },
        submitted: {},
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
      type: "parallel",
      states: {
        input: {
          initial: "focused",
          states: {
            focused: {
              on: {
                UNFOCUS_INPUT: "unfocused",
              },
            },
            unfocused: {
              on: {
                FOCUS_INPUT: "focused",
              },
            },
          },
        },
        searchResults: {
          initial: "notHovering",
          states: {
            hovering: {
              on: {
                MOUSELEAVE_RESULTS: "notHovering",
              },
            },
            notHovering: {
              on: {
                MOUSEENTER_RESULTS: "hovering",
              },
            },
          },
        },
      },
      on: {
        CHANGE: {
          actions: assign({
            stage: (ctx, e) => e.stage,
          }),
        },
        COMMIT: [
          {
            target: "reading",
            actions: [
              assign({
                stage: (ctx, { stage }) => stage,
              }),
            ],
          },
        ],
        BLUR: [
          {
            target: "reading",
            actions: assign({
              stage: ({ prevStage }) => prevStage,
            }),
          },
        ],
        CANCEL: {
          target: "reading",
          actions: assign({ stage: (ctx) => ctx.prevStage }),
        },
      },
    },
    validating: {
      onEntry: [
        assign({
          stage: (ctx) => {
            const result = ctx.stageInfo.filter(
              (s) => s.name.toLowerCase() === ctx.stage.toLowerCase()
            );
            return result.length === 1 ? result[0].name : ctx.prevStage;
          },
        }),
      ],
      on: {
        always: "reading",
      },
    },
    deleted: {
      onEntry: sendParent((ctx) => ({ type: "STAGE.DELETE", id: ctx.id })),
    },
    hist: {
      type: "history",
      history: "deep",
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
