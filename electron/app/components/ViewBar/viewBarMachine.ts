import { Machine, actions, assign, spawn, send } from "xstate";
import uuid from "uuid-v4";
import viewStageMachine, {
  createParameter,
} from "./ViewStage/viewStageMachine";
import { PARSER as PARAM_PARSER } from "./ViewStage/viewStageParameterMachine";

const { choose } = actions;

export const createStage = (
  stage,
  index,
  stageInfo,
  focusOnInit,
  length,
  active,
  parameters,
  submitted,
  loaded
) => ({
  id: uuid(),
  stage: stage,
  parameters,
  stageInfo,
  index,
  focusOnInit,
  length,
  active,
  inputRef: {},
  submitted,
  loaded,
});

import { getSocket } from "../../utils/socket";

function getStageInfo(context) {
  return fetch(`http://127.0.0.1:${context.port}/stages`).then((response) =>
    response.json()
  );
}

function serializeStage(stage, stageMap) {
  return {
    kwargs: stage.parameters.map((param, i) => {
      return [
        param.parameter,
        operate(stageMap[stage.stage][i].type, "castTo", param.value),
      ];
    }),
    _cls: `fiftyone.core.stages.${stage.stage}`,
  };
}

function operate(type, operator, value, isString = true) {
  return type.split("|").reduce((acc, t) => {
    if (acc !== undefined) return acc;
    const parser = PARAM_PARSER[t];
    return parser.validate(!isString ? parser.castFrom(value) : value)
      ? parser[operator](value)
      : acc;
  }, undefined);
}

function serializeView(stages, stageMap) {
  if (stages.length === 1 && stages[0].stage === "") return [];
  return stages.map((stage) => serializeStage(stage, stageMap));
}

function makeEmptyView(stageInfo) {
  const stage = createStage("", 0, stageInfo, false, 1, true, [], false);
  return [
    {
      ...stage,
      ref: spawn(viewStageMachine.withContext(stage)),
    },
  ];
}

function setStages(ctx, stageInfo) {
  const viewStr = ctx.stateDescription.view.view;
  const view = JSON.parse(viewStr);
  const stageMap = Object.fromEntries(stageInfo.map((s) => [s.name, s.params]));
  if (viewStr === JSON.stringify(serializeView(ctx.stages, stageMap))) {
    return ctx.stages;
  } else if (view.length === 0) {
    return makeEmptyView(stageInfo);
  } else {
    return view.map((stage, i) => {
      let stageName = stage._cls.split(".");
      stageName = stageName[stageName.length - 1];
      const newStage = createStage(
        stageName,
        i,
        stageInfo,
        false,
        ctx.stages.length,
        i === Math.min(view.length - 1, ctx.activeStage),
        stage.kwargs
          .filter((k) => !k[0].startsWith("_"))
          .map((p, j) => {
            const stageInfoResult = stageInfo.filter(
              (s) => s.name === stageName
            )[0];
            return createParameter(
              stageName,
              p[0],
              stageInfoResult.params[j].type,
              stageInfoResult.params[j].default,
              operate(stageInfoResult.params[j].type, "castFrom", p[1], false),
              true,
              false,
              j === stageInfoResult.params.length - 1,
              i === Math.min(view.length - 1, ctx.activeStage)
            );
          }),
        true,
        true
      );
      return {
        ...newStage,
        ref: spawn(viewStageMachine.withContext(newStage)),
      };
    });
  }
}

const viewBarMachine = Machine(
  {
    id: "stages",
    context: {
      socket: undefined,
      stages: [],
      stageInfo: undefined,
      activeStage: 0,
      setStateDescription: undefined,
      stateDescription: undefined,
      port: undefined,
    },
    initial: "initializing",
    states: {
      decide: {
        always: [
          {
            target: "running.hist",
            cond: (ctx) => ctx.stageInfo,
            actions: [
              assign({
                activeStage: (ctx) =>
                  Math.min(
                    Math.max(ctx.stateDescription.view.view.length - 1, 0),
                    ctx.activeStage
                  ),
                stages: (ctx) => setStages(ctx, ctx.stageInfo),
              }),
            ],
          },
          {
            target: "loading",
          },
        ],
      },
      initializing: {},
      loading: {
        invoke: {
          src: getStageInfo,
          onDone: {
            target: "running",
            actions: assign({
              stageInfo: (ctx, e) => e.data.stages,
              stages: (ctx, e) => {
                const view = JSON.parse(ctx.stateDescription.view.view);
                if (view.length === 0) return makeEmptyView(e.data.stages);
                return setStages(ctx, e.data.stages);
              },
            }),
          },
        },
      },
      running: {
        type: "parallel",
        states: {
          focus: {
            initial: "blurred",
            states: {
              focused: {
                entry: [
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
                  TOGGLE_FOCUS: {
                    target: "blurred",
                  },
                  NEXT: {
                    actions: [
                      assign({
                        activeStage: ({ stages, activeStage }) => {
                          const i = activeStage;
                          if (i === stages.length - 0.5) return i;
                          if (i % 1 !== 0) return Math.ceil(i);
                          if (
                            stages[i].submitted &&
                            (i === stages.length - 1 || stages[i + 1].submitted)
                          )
                            return i + 0.5;
                          return Math.min(stages.length - 1, i + 1);
                        },
                      }),
                      "sendStagesUpdate",
                    ],
                  },
                  PREVIOUS: {
                    actions: [
                      assign({
                        activeStage: ({ stages, activeStage }) => {
                          const i = activeStage;
                          if (i === -0.5) return i;
                          if (i % 1 !== 0) return Math.floor(i);
                          if (
                            stages[i].submitted &&
                            (i === 0 || stages[i - 1].submitted)
                          )
                            return i - 0.5;
                          return Math.max(0, i - 1);
                        },
                      }),
                      "sendStagesUpdate",
                    ],
                  },
                  NEXT_STAGE: {
                    actions: [
                      assign({
                        activeStage: ({ stages, activeStage }) =>
                          Math.min(
                            Math.floor(activeStage + 1),
                            stages.length - 1
                          ),
                      }),
                      "sendStagesUpdate",
                    ],
                  },
                  PREVIOUS_STAGE: {
                    actions: [
                      assign({
                        activeStage: ({ stages, activeStage }) =>
                          Math.max(Math.ceil(activeStage - 1), 0),
                      }),
                      "sendStagesUpdate",
                    ],
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
                  DELETE_ACTIVE_STAGE: {
                    actions: send(({ activeStage, stages }) => ({
                      type: "STAGE.DELETE",
                      stage: stages[activeStage],
                    })),
                  },
                  ENTER: {
                    actions: [
                      choose([
                        {
                          actions: send(({ activeStage }) => ({
                            type: "STAGE.ADD",
                            index: Math.ceil(activeStage),
                          })),
                          cond: ({ activeStage }) =>
                            Math.abs(activeStage % 1) === 0.5,
                        },
                        {
                          actions: send(({ stages, activeStage }) => {
                            stages[activeStage].ref.send({ type: "EDIT" });
                          }),
                        },
                      ]),
                    ],
                  },
                },
              },
              blurred: {
                on: {
                  TOGGLE_FOCUS: {
                    target: "focused",
                  },
                },
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
          hist: {
            type: "history",
            history: "deep",
          },
        },
      },
    },
    on: {
      "STAGE.EDIT": {
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
            activeStage: (_, { index }) => index,
            stages: (ctx, { index }) => {
              const newStage = createStage(
                "",
                index,
                ctx.stageInfo,
                true,
                ctx.stages.length + 1,
                true,
                [],
                false
              );
              newStage.added = true;
              return [
                ...ctx.stages.slice(0, index),
                {
                  ...newStage,
                  ref: spawn(viewStageMachine.withContext(newStage)),
                },
                ...ctx.stages.slice(index),
              ].map((stage, index) => ({
                ...stage,
                index,
                active: index === index,
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
            activeStage: ({ activeStage }) => activeStage + 0.5,
          }),
          "submit",
        ],
      },
      CLEAR: {
        actions: [
          assign({
            stages: (ctx) => {
              const stage = createStage(
                "",
                0,
                ctx.stageInfo,
                false,
                0,
                true,
                [],
                false
              );
              return [
                {
                  ...stage,
                  ref: spawn(viewStageMachine.withContext(stage)),
                },
              ];
            },
          }),
          "submit",
        ],
      },
      "STAGE.DELETE": {
        actions: [
          assign({
            activeStage: ({ activeStage }) => Math.max(activeStage - 1, 0),
            stages: ({ stages, stageInfo }, e) => {
              if (stages.length === 1 && stages[0].id === e.stage.id) {
                const stage = createStage(
                  "",
                  0,
                  stageInfo,
                  false,
                  0,
                  true,
                  [],
                  false
                );
                return [
                  {
                    ...stage,
                    ref: spawn(viewStageMachine.withContext(stage)),
                  },
                ];
              } else {
                return stages
                  .filter(
                    (stage) => stage.id !== e.stage.id || stages.length === 1
                  )
                  .map((stage, index) => {
                    const newStage = stage.id === e.stage.id ? e.stage : stage;
                    newStage.index = index;
                    newStage.length = Math.max(stages.length - 1, 1);
                    return newStage;
                  });
              }
            },
          }),
          "submit",
        ],
      },
      UPDATE: {
        target: "decide",
        actions: [
          assign({
            port: (_, { port }) => port,
            socket: (_, { port }) => getSocket(port, "state"),
            stateDescription: (_, e) => {
              return e.stateDescription;
            },
            setStateDescription: (_, e) => e.setStateDescription,
          }),
          "sendStagesUpdate",
        ],
      },
    },
  },
  {
    actions: {
      sendStagesUpdate: (ctx) => {
        ctx.stages.forEach((stage) =>
          stage.ref.send({
            type: "STAGE.UPDATE",
            index: stage.index,
            length: ctx.stages.length,
            active: stage.index === ctx.activeStage,
            stage: stage.stage,
          })
        );
      },
      submit: ({ socket, stateDescription, stages, stageInfo }) => {
        const stageMap = Object.fromEntries(
          stageInfo.map((s) => [s.name, s.params])
        );
        const result = JSON.stringify(serializeView(stages, stageMap));
        const {
          view: { dataset },
        } = stateDescription;
        if (result === JSON.stringify(JSON.parse(stateDescription.view.view)))
          return;
        const newState = {
          ...stateDescription,
          view: {
            dataset,
            view: result,
          },
        };
        socket.emit("update", { data: newState, include_self: true });
      },
    },
  }
);

export default viewBarMachine;
