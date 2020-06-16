import { Machine } from "xstate";

export default Machine({
  id: "indicator",

  initial: "unclicked",

  context: {
    index: 0,
    velocity: 0,
    acceleration: 0,
  },

  states: {
    unclicked: {
      on: {
        CLICK: "clicked",
      },
    },
    clicked: {
      on: {
        RELEASE: "unclicked",
        DRAGGING: "dragging",
      },
    },
    dragging: {
      on: {
        RELEASE: "unclicked",
        STOPPING: "clicked",
      },
    },
  },
});
