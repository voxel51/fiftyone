import { Machine, assign, spawn } from "xstate";
import uuid from "uuid-v4";
import viewStageMachine from "./ViewStage/viewStageMachine";

export const createStage = (stage, insertAt, stageInfo) => {
  return {
    id: uuid(),
    submitted: false,
    stage: stage,
    parameters: [],
    stageInfo,
    insertAt,
  };
};

export const createBar = (port) => {
  return {
    port: port,
    stages: [],
    stageInfo: undefined,
    tailStage: undefined,
  };
};

function getStageInfo(context) {
  return fetch(`http://127.0.0.1:${context.port}/stages`).then((response) =>
    response.json()
  );
}

const viewBarMachine = Machine({
  id: "stages",
  context: {
    port: undefined,
    stages: [],
    stageInfo: undefined,
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
            stageInfo: (ctx, event) => {
              return event.data.stages;
            },
          }),
        },
      },
    },
    running: {
      entry: assign({
        stages: (ctx) => {
          return ctx.stages.map((stage) => {
            const newStage = createStage(stage, undefined, ctx.stageInfo);
            return {
              stage: newStage,
              ref: spawn(viewStageMachine.withContext(newStage)),
            };
          });
        },
        tailStage: (ctx) => {
          const tailStage = createStage("", ctx.stages.length, ctx.stageInfo);
          return {
            ...tailStage,
            ref: spawn(viewStageMachine.withContext(tailStage)),
          };
        },
      }),
    },
  },
  on: {
    "STAGE.COMMIT": {
      actions: [
        assign({
          stages: (ctx, e) => {
            return ctx.stages.map((stage) => {
              return stage.id === e.stage.id
                ? { ...stage, ...e.stage, ref: stage.ref }
                : stage;
            });
          },
        }),
      ],
    },
    "STAGE.DELETE": {
      actions: [
        assign({
          stages: (ctx, e) => ctx.stages.filter((stage) => stage.id !== e.id),
        }),
      ],
    },
  },
});

export default viewBarMachine;
