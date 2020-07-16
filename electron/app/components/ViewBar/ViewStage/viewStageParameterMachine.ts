import { Machine, actions, sendParent } from "xstate";
import viewStageMachine from "./viewStageMachine";
const { assign } = actions;

const viewStageParameterMachine = Machine({
  id: "viewStageParameter",
  initial: "reading",
  context: {
    id: undefined,
    stage: undefined,
    parameter: undefined,
    value: undefined,
    completed: undefined,
  },
  on: {
    TOGGLE_COMPLETE: {
      target: ".reading.completed",
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
                sendParent((ctx) => ({
                  type: "PARAMETER.COMMIT",
                  parameter: ctx,
                })),
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
                sendParent((ctx) => ({
                  type: "PARAMETER.COMMIT",
                  parameter: ctx,
                })),
              ],
            },
            SET_ACTIVE: {
              target: "pending",
              actions: [
                assign({ completed: false }),
                sendParent((ctx) => ({
                  type: "PARAMETER.COMMIT",
                  parameter: ctx,
                })),
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
          { target: "deleted" },
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
