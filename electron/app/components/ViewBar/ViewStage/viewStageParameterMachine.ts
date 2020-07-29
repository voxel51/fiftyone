import { Machine, actions, sendParent, send } from "xstate";
import viewStageMachine from "./viewStageMachine";
const { assign, choose } = actions;

export default Machine(
  {
    id: "viewStageParameter",
    initial: "reading",
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
      reading: {
        initial: "unknown",
        entry: "blurInput",
        always: [
          {
            target: "editing",
            cond: (ctx) => ctx.focusOnInit,
          },
          {
            target: "reading",
          },
        ],
        states: {
          unknown: {
            always: [
              {
                target: "submitted",
                cond: (ctx) => ctx.value.trim().length > 0,
              }, // more checks needed
              { target: "pending" },
            ],
          },
          pending: {},
          submitted: {},
        },
      },
      editing: {
        onEntry: [
          assign({
            prevValue: (ctx) => ctx.value,
          }),
          "focusInput",
        ],
        on: {
          CHANGE: {
            actions: [
              assign({
                value: (ctx, e) => e.value,
              }),
              () => console.log("change"),
            ],
          },
          COMMIT: [
            {
              target: "reading.submitted",
              actions: ["blurInput", () => console.log("commit")],
              cond: (ctx) => {
                return ctx.value.trim().length > 0;
              },
            },
          ],
          CANCEL: {
            target: "reading",
            actions: [
              assign({
                value: (ctx) => ctx.prevValue,
              }),
              () => console.log("cancel"),
            ],
          },
        },
      },
    },
    on: {
      EDIT: "editing",
      BLUR: "reading",
    },
  },
  {
    actions: {
      focusInput: () => console.log("focus"),
      blurInput: () => console.log("blur"),
    },
  }
);
