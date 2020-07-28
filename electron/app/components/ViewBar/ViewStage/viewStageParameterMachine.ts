import { Machine, actions, sendParent } from "xstate";
import viewStageMachine from "./viewStageMachine";
const { assign } = actions;

export default Machine({
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
    committed: false,
  },
  states: {
    reading: {
      initial: "unknown",
      states: {
        unknown: {
          always: [
            {
              target: "submitted",
              cond: (ctx) => ctx.value.trim().length > 0,
            }, // more checks needed
            { target: "pending", cond: () => true },
          ],
        },
        pending: {},
        submitted: {},
      },
      on: {
        EDIT: {
          target: "editing",
          actions: () => console.log("edit"),
        },
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
        BLUR: {
          target: "reading",
          actions: () => console.log("blur"),
        },
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
});
