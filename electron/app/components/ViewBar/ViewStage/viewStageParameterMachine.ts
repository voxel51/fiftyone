import { Machine, actions, sendParent } from "xstate";
import viewStageMachine from "./viewStageMachine";
const { assign } = actions;

const viewStageParameterMachine = Machine({
  id: "viewStageParameter",
  initial: "reading",
  context: {
    id: undefined,
    parameter: undefined,
    stage: undefined,
    type: undefined,
    value: undefined,
  },
  on: {
    TOGGLE_SUBMITTED: {
      target: "reading.submitted",
      actions: [
        assign({ completed: true }),
        sendParent(
          (ctx) => (
            console.log("commit"), { type: "PARAMETER.COMMIT", parameter: ctx }
          )
        ),
      ],
    },
  },
  states: {
    reading: {
      initial: "unknown",
      states: {
        unknown: {
          on: {
            "": [
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
          actions: "focusInput",
        },
      },
    },
    editing: {
      onEntry: assign({ prevValue: (ctx) => ctx.value }),
      on: {
        CHANGE: {
          actions: assign({
            value: (ctx, e) => e.value,
          }),
        },
        COMMIT: [
          {
            target: "reading.hist",
            actions: sendParent((ctx) => ({
              type: "PARAMETER.COMMIT",
              parameter: ctx,
            })),
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
          actions: assign({ value: (ctx) => ctx.value }),
        },
      },
    },
  },
});

export default viewStageParameterMachine;
