import { Machine } from "xstate";

export default Machine({
  id: "indicator",
  type: "parellel",

  states: {
    hovering: {
      initial: "no",
      states: {
        no: {
          on: {
            MOUSEOVER: "yes",
          },
        },
        yes: {
          on: {
            MOUSEOUT: "no",
          },
        },
      },
    },
    dragging: {
      initial: "no",
      states: {
        no: {
          on: {
            CLICK: "yes",
          },
        },
        yes: {
          on: {
            MOUSEOUT: "no",
          },
        },
      },
    },
  },
});
