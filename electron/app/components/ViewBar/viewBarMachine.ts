import { Machine, assign, spawn } from "xstate";
import uuid from "uuid-v4";
import viewStageMachine from "./ViewStage/viewStageMachine";
import ViewStageStories from "./ViewStage/ViewStage.stories";

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
              ...newStage,
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
            const newStages = [...ctx.stages];
            newStages[e.stage.insertAt] = {
              ...e.stage,
              ref: newStages[e.stage.insertAt].ref,
            };
            return newStages;
          },
        }),
      ],
    },
    "STAGE.DELETE": {
      actions: [
        assign({
          stages: ({ stages }, e) => {
            if (stages.length === 1) {
              return [{ ...e.stage, ref: stages[0].ref }];
            } else {
              return ctx.stages.filter((stage) => stage.id !== e.id);
            }
          },
        }),
      ],
    },
  },
});

export default viewBarMachine;
