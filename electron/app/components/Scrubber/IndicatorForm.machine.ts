import { Machine } from "xstate";

export default Machine({
  id: "indicator-form",

  initial: "unfocused",

  context: {
    value: 0,
    error: null,
  },

  states: {
    unfocused: {
      on: {
        MOUSE_OVER: "mouseOver",
      },
    },
    mouseOver: {
      invoke: {
        src: "onHover",
        onDone: { target: "hovering" },
      },
    },
    mouseOut: {
      invoke: {
        src: "onMouseOut",
        onDone: { target: "unfocused" },
      },
    },
    focused: {
      on: {
        SUBMIT: "submitting",
        UNFOCUS: "clicked",
      },
    },
    hovering: {
      on: {
        MOUSE_OUT: "mouseOut",
      },
    },
    submitting: {
      invoke: {
        src: "onSubmit",
        onDone: { target: "unfocused" },
      },
    },
  },
});
