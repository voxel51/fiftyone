import { Machine, actions, sendParent, send } from "xstate";
import viewStageMachine from "./viewStageMachine";
const { assign, choose } = actions;

export default Machine(
  {
    id: "viewStageParameter",
    initial: "decide",
    context: {
      id: undefined,
      parameter: undefined,
      stage: undefined,
      type: undefined,
      value: undefined,
      submitted: undefined,
      tail: undefined,
      focusOnInit: undefined,
    },
    states: {
      decide: {
        always: [
          {
            target: "editing",
            cond: (ctx) => ctx.focusOnInit,
          },
          {
            target: "reading.submitted",
            cond: (ctx) => ctx.submitted,
          },
          {
            target: "reading.pending",
          },
        ],
      },
      reading: {
        initial: "pending",
        entry: "blurInput",
        states: {
          pending: {},
          submitted: {},
        },
        on: {
          EDIT: "editing",
        },
      },
      editing: {
        entry: [
          assign({
            prevValue: (ctx) => ctx.value,
            focusOnInit: false,
          }),
          "focusInput",
        ],
        on: {
          BLUR: [
            {
              target: "reading.pending",
              cond: (ctx) => !ctx.submitted,
            },
            {
              target: "reading.submitted",
              cond: (ctx) => ctx.submitted,
              actions: assign({
                stage: (ctx) => ctx.prevStage,
              }),
            },
          ],
          CHANGE: {
            actions: [
              assign({
                value: (ctx, e) => e.value,
              }),
            ],
          },
          COMMIT: [
            {
              target: "decide",
              actions: [
                assign({
                  submitted: true,
                }),
                sendParent((ctx) => ({
                  type: "PARAMETER.COMMIT",
                  parameter: ctx,
                })),
              ],
              cond: (ctx) => {
                return ctx.value.trim().length > 0;
              },
            },
            {
              target: "decide",
            },
          ],
          CANCEL: {
            target: "reading",
            actions: [
              assign({
                value: (ctx) => ctx.prevValue,
              }),
            ],
          },
        },
      },
    },
  },
  {
    actions: {
      blurInput: () => {},
      focusInput: () => {},
    },
  }
);
