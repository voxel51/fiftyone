import { Machine, assign, spawn } from "xstate";
import uuid from "uuid-v4";
import viewStageMachine from "./ViewStage/viewStageMachine";

export const createStage = (stage) => {
  return {
    id: uuid(),
    completed: false,
    stage: stage ? stage : "",
    parameters: [],
  };
};

export const createBar = (socket) => {
  return {
    stages: [],
    stageInfo: undefined,
    socket: socket,
    tailStage: undefined,
  };
};

function getStageInfo(context) {
  return new Promise((resolve) => {
    context.socket.on("connect", () => {
      context.socket.emit("get_stages", "", (data) => {
        resolve(data);
      });
    });
  });
}

const viewBarMachine = Machine({
  id: "stages",
  context: {
    stages: [],
    stageInfo: undefined,
    socket: undefined,
    tailStage: undefined,
  },
  initial: "initializing",
  states: {
    initializing: {
      invoke: {
        src: getStageInfo,
        onDone: {
          target: "running",
          actions: assign({
            stageInfo: (ctx, event) => event.data,
          }),
        },
      },
      entry: assign({
        tailStage: () => {
          const newTailStage = createStage();
          return {
            ...newTailStage,
            ref: spawn(viewStageMachine.withContext(newTailStage)),
          };
        },
        stages: (ctx, e) => {
          return ctx.stages.map((stage) => ({
            ...stage,
            ref: spawn(viewStageMachine.withContext(stage)),
          }));
        },
      }),
    },
    running: {},
  },
  on: {
    "NEWSTAGE.CHANGE": {
      actions: assign({
        stage: (ctx, e) => e.value,
      }),
    },
    "NEWSTAGE.COMMIT": {
      actions: [
        assign({
          tailStage: () => {
            const newTailStage = createStage();
            return {
              ...newTailStage,
              ref: spawn(viewStageMachine.withContext(newTailStage)),
            };
          },
          stages: (ctx, e) => {
            const newStage = createStage(e.value.trim());
            return ctx.stages.concat({
              ...newStage,
              ref: spawn(viewStageMachine.withContext(newStage)),
            });
          },
        }),
        "submit",
      ],
      cond: (ctx, e) => e.value.trim().length,
    },
    "STAGE.COMMIT": {
      actions: [
        assign({
          stages: (ctx, e) =>
            ctx.stages.map((stage) => {
              return stage.id === e.stage.id
                ? { ...stage, ...e.stage, ref: stage.ref }
                : stage;
            }),
        }),
        "submit",
      ],
    },
    "STAGE.DELETE": {
      actions: [
        assign({
          stages: (ctx, e) => ctx.stages.filter((stage) => stage.id !== e.id),
        }),
        "submit",
      ],
    },
  },
});

export default viewBarMachine;
