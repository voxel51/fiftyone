import { Machine, actions, sendParent } from "xstate";
import viewStageMachine from "./viewStageMachine";
const { assign } = actions;

export const viewStageParameterMachineConfig = {
  id: "viewStageParameter",
  initial: "reading",
  context: {
    id: undefined,
    parameter: undefined,
    stage: undefined,
    type: undefined,
    value: undefined,
  },
  states: {
    reading: {
      initial: "unknown",
      states: {
        unknown: {
          on: {
            always: [
              {
                target: "submitted",
                cond: (ctx) => ctx.value.trim().length > 0,
              }, // more checks needed
              { target: "pending" },
            ],
          },
        },
        pending: {
          on: {
            SUBMIT: {
              target: "submitted",
              actions: [
                sendParent((ctx) => ({
                  type: "PARAMETER.COMMIT",
                  parameter: ctx,
                })),
              ],
            },
          },
        },
        submitted: {},
        hist: {
          type: "history",
        },
      },
      on: {
        EDIT: {
          target: "editing",
        },
      },
    },
    editing: {
      onEntry: [assign({ prevValue: (ctx) => ctx.value }), "focusInput"],
      on: {
        CHANGE: {
          actions: assign({
            value: (ctx, e) => e.value,
          }),
        },
        COMMIT: [
          {
            target: "reading.hist",
            actions: [
              assign({
                value: (ctx) => ctx.value,
                submitted: true,
              }),
              sendParent((ctx) => ({
                type: "PARAMETER.COMMIT",
                parameter: ctx,
              })),
            ],
            cond: (ctx) => ctx.value.trim().length > 0,
          },
        ],
        BLUR: {
          target: "reading",
          actions: sendParent((ctx) => ({
            type: "PARAMETER.COMMIT",
            parameter: ctx,
          })),
        },
        CANCEL: {
          target: "reading",
          actions: assign({ value: (ctx) => ctx.prevValue }),
        },
      },
    },
  },
};

const viewStageParameterMachine = Machine(viewStageParameterMachineConfig, {
  actions: {
    focusInput: () => {},
  },
});

export default viewStageParameterMachine;
