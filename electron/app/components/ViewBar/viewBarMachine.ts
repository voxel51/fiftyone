import { Machine, assign, spawn, send } from "xstate";
import uuid from "uuid-v4";
import viewStageMachine from "./ViewStage/viewStageMachine";
import ViewStageStories from "./ViewStage/ViewStage.stories";

export const createStage = (
  stage,
  index,
  stageInfo,
  focusOnInit,
  length,
  active
) => ({
  id: uuid(),
  submitted: false,
  stage: stage,
  parameters: [],
  stageInfo,
  index,
  focusOnInit,
  length,
  active,
  inputRef: {},
});

export const createBar = (port) => ({
  port: port,
  stages: [],
  stageInfo: undefined,
  activeStage: 0,
});

function getStageInfo(context) {
  return fetch(`http://127.0.0.1:${context.port}/stages`).then((response) =>
    response.json()
  );
}

const viewBarMachine = Machine(
  {
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
              const newStage = createStage(
                stage,
                i,
                ctx.stageInfo,
                false,
                ctx.stages.length,
                i === ctx.activeStage
              );
              return {
                ...newStage,
                ref: spawn(viewStageMachine.withContext(newStage)),
              };
            });
          },
        }),
        type: "parallel",
        states: {
          focus: {
            initial: "blurred",
            states: {
              focused: {
                entry: [
                  "focusBar",
                  ({ stages }) =>
                    stages.forEach((stage) =>
                      stage.ref.send({ type: "BAR_FOCUS" })
                    ),
                ],
                exit: [
                  ({ stages }) =>
                    stages.forEach((stage) =>
                      stage.ref.send({ type: "BAR_BLUR" })
                    ),
                ],
                on: {
                  BLUR: {
                    target: "blurred",
                  },
                  NEXT: {
                    actions: [
                      assign({
                        activeStage: ({ stages, activeStage }) => {
                          return Math.min(
                            stages.length - 0.5,
                            activeStage + 0.5
                          );
                        },
                      }),
                      "sendStagesUpdate",
                    ],
                  },
                  PREVIOUS: {
                    actions: [
                      assign({
                        activeStage: ({ stages, activeStage }) => {
                          return Math.max(-0.5, activeStage - 0.5);
                        },
                      }),
                      "sendStagesUpdate",
                    ],
                  },
                  NEXT_STAGE: {
                    actions: [
                      assign({
                        activeStage: ({ stages, activeStage }) =>
                          Math.min(activeStage + 1, stages.length - 1),
                      }),
                      "sendStagesUpdate",
                    ],
                  },
                  PREV_STAGE: {
                    actions: [
                      assign({
                        activeStage: ({ stages, activeStage }) =>
                          Math.max(activeStage - 1, 0),
                      }),
                      "sendStagesUpdate",
                    ],
                  },
                  DELETE_STAGE: {
                    actions: send((ctx) => ({
                      type: "STAGE.DELETE",
                      stage: ctx.stages.filter(
                        stage.index === ctx.activeStage
                      )[0],
                    })),
                  },
                  NEXT_RESULT: {
                    actions: send(({ stages, activeStage }) => ({
                      type: "NEXT_RESULT",
                      to: stages[activeStage].ref,
                    })),
                  },
                  PREVIOUS_RESULT: {
                    actions: send(({ stages, activeStage }) => ({
                      type: "PREVIOUS_RESULT",
                      to: stages[activeStage].ref,
                    })),
                  },
                },
              },
              blurred: {},
            },
            on: {
              FOCUS: {
                target: "focus.focused",
              },
            },
          },
          hovering: {
            initial: "no",
            states: {
              yes: {
                on: {
                  MOUSELEAVE: "no",
                },
              },
              no: {
                on: {
                  MOUSEENTER: "yes",
                },
              },
            },
          },
        },
      },
    },
    on: {
      SET: {
        actions: [
          assign({
            activeStage: (_, e) => e.index,
          }),
          "sendStagesUpdate",
        ],
      },
      "STAGE.ADD": {
        actions: [
          assign({
            activeStage: (_, { index }) => Math.ceil(index),
            stages: (ctx, e) => {
              const newStage = createStage(
                "",
                e.index ? e.index : activeStage,
                ctx.stageInfo,
                true,
                ctx.stages.length + 1,
                true
              );
              return [
                ...ctx.stages.slice(0, e.index),
                {
                  ...newStage,
                  ref: spawn(viewStageMachine.withContext(newStage)),
                },
                ...ctx.stages.slice(e.index),
              ].map((stage, index) => ({
                ...stage,
                index,
                active: index === e.index,
                length: ctx.stages.length + 1,
              }));
            },
          }),
          "sendStagesUpdate",
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
          send("FOCUS"),
        ],
      },
      "STAGE.DELETE": {
        actions: [
          assign({
            activeStage: ({ activeStage, stages }) => {},
            stages: ({ stages }, e) =>
              stages
                .filter(
                  (stage) => stage.id !== e.stage.id || stages.length === 1
                )
                .map((stage, index) => {
                  const newStage = stage.id === e.stage.id ? e.stage : stage;
                  return {
                    ...newStage,
                    index,
                    length: Math.max(stages.length - 1, 1),
                    ref: stage.ref,
                  };
                }),
          }),
          "sendStagesUpdate",
        ],
      },
    },
  },
  {
    actions: {
      sendStagesUpdate: (ctx) =>
        ctx.stages.forEach((stage) =>
          stage.ref.send({
            type: "STAGE.UPDATE",
            index: stage.index,
            length: ctx.stages.length,
            active: stage.index === ctx.activeStage,
          })
        ),
      focusBar: () => {},
      blurBar: () => {},
    },
  }
);

export default viewBarMachine;
