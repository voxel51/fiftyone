import { Machine, assign, spawn, send } from "xstate";
import uuid from "uuid-v4";
import viewStageMachine from "./ViewStage/viewStageMachine";
import ViewStageStories from "./ViewStage/ViewStage.stories";

export const createStage = (
  stage,
  index,
  stageInfo,
  focusOnInit,
  hideDelete
) => ({
  id: uuid(),
  submitted: false,
  stage: stage,
  parameters: [],
  stageInfo,
  index,
  focusOnInit,
  hideDelete,
});

export const createBar = (port) => ({
  port: port,
  stages: [],
  stageInfo: undefined,
});

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
            stageInfo: (ctx, event) => event.data.stages,
            stages: (ctx) => (ctx.stages.length === 0 ? [""] : stages),
          }),
        },
      },
    },
    running: {
      entry: assign({
        stages: (ctx) => {
          return ctx.stages.map((stage, i) => {
            const newStage = createStage(stage, i, ctx.stageInfo, false, true);
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
            const newStage = createStage(
              "",
              e.index,
              ctx.stageInfo,
              true,
              false
            );
            const stages = [
              ...ctx.stages.slice(0, e.index),
              {
                ...newStage,
                ref: spawn(viewStageMachine.withContext(newStage)),
              },
              ...ctx.stages.slice(e.index),
            ];
            return stages.map((stage, index) => ({
              ...stage,
              index,
              hideDelete: index === 0 && ctx.stages.length === 1,
            }));
          },
        }),
        (ctx) =>
          ctx.stages.forEach((stage) =>
            stage.ref.send({
              type: "STAGE.UPDATE",
              index: stage.index,
              hideDelete: stage.hideDelete,
              to: stage.ref,
            })
          ),
      ],
    },
    "STAGE.COMMIT": {
      actions: [
        assign({
          stages: ({ stages }, e) => {
            stages[e.stage.index] = {
              ...e.stage,
              ref: stages[e.stage.index].ref,
            };
            return stages;
          },
        }),
      ],
    },
    "STAGE.DELETE": {
      actions: [
        assign({
          stages: ({ stages }, e) => {
            if (stages.length === 1) {
              return [
                { ...e.stage, index: 0, hideDelete: true, ref: stages[0].ref },
              ];
            } else {
              return stages
                .filter((stage) => stage.id !== e.stage.id)
                .map((stage, index) => ({
                  ...stage,
                  index,
                  hideDelete: index === 0 && stages.length - 1 === 1,
                }));
            }
          },
        }),
        (ctx) =>
          ctx.stages.forEach((stage) =>
            stage.ref.send({
              type: "STAGE.UPDATE",
              index: stage.index,
              hideDelete: stage.hideDelete,
              to: stage.ref,
            })
          ),
      ],
    },
  },
});

export default viewBarMachine;
