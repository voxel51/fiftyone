import { Machine, assign } from "xstate";

export default Machine(
  {
    id: "IndicatorForm",

    initial: "blurred",

    context: {
      currentInput: "",
    },

    states: {
      blurred: {
        on: {
          FOCUS: {
            target: "focused",
            actions: ["assignCurrentInput"],
          },
        },
      },
      focused: {
        on: {
          BLUR: "blurred",
          TYPE: {
            target: "focused",
            actions: ["assignCurrentInput"],
          },
        },
      },
    },
  },
  {
    actions: {
      assignCurrentInput: assign({
        currentInput: (ctx, e) =>
          e.payload !== undefined ? e.payload : ctx.currentInput,
      }),
    },
  }
);
