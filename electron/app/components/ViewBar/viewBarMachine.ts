import { Machine, assign, spawn } from "xstate";
import uuid from "uuid-v4";
import viewStageMachine from "./ViewStage/viewStageMachine";

export const createStage = (stage, insertAt, stageInfo, focusOnInit) => {
  return {
    id: uuid(),
    submitted: false,
    stage: stage,
    parameters: [],
    stageInfo,
    insertAt,
    focusOnInit,
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
            stages: (ctx) => (ctx.stages.length === 0 ? [""] : stages),
          }),
        },
      },
    },
    running: {
      entry: assign({
        stages: (ctx) => {
          return ctx.stages.map((stage) => {
            const newStage = createStage(
              stage,
              stage === "" ? 0 : undefined,
              ctx.stageInfo
            );
            return {
              stage: newStage,
              ref: spawn(viewStageMachine.withContext(newStage)),
            };
          });
        },
      }),
    },
  },
  on: {
    "STAGE.ADD": {
      actions: [
        assign({
          stages: (ctx, e) => {
            const newStage = createStage("", e.insertAt, ctx.stageInfo, true);
            return [
              ...ctx.stages.slice(0, e.insertAt),
              {
                ...newStage,
                ref: spawn(viewStageMachine.withContext(newStage)),
              },
              ...ctx.stages.slice(e.insertAt),
            ];
          },
        }),
      ],
    },
    "STAGE.COMMIT": {
      actions: [
        assign({
          stages: (ctx, e) => {
            const newStages = [
              ...ctx.stages.slice(0, e.stage.insertAt),
              {
                ...e.stage,
                tailStage: false,
                insertAt: undefined,
                ref: ctx.tailStage.ref,
              },
              ...ctx.stages.slice(e.stage.insertAt),
            ];
            console.log(ctx.stages, newStages);
            return newStages;
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
