import { Machine, actions, assign, spawn, send } from "xstate";
import uuid from "uuid-v4";
import viewStageMachine, {
  createParameter,
} from "./ViewStage/viewStageMachine";
import viewStageParameterMachine, {
  PARSER as PARAM_PARSER,
} from "./ViewStage/viewStageParameterMachine";

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

const { choose } = actions;

const compareObjects = (a, b) => {
  if (a === b) return true;

  if (typeof a != "object" || typeof b != "object" || a == null || b == null)
    return false;

  let keysA = Object.keys(a),
    keysB = Object.keys(b);

  if (keysA.length != keysB.length) return false;

  for (let key of keysA) {
    if (!keysB.includes(key)) return false;

    if (typeof a[key] === "function" || typeof b[key] === "function") {
      if (a[key].toString() != b[key].toString()) return false;
    } else {
      if (!compareObjects(a[key], b[key])) return false;
    }
  }

  return true;
};

function getStageInfo(context) {
  return fetch(`http://127.0.0.1:${context.port}/stages`).then((response) =>
    response.json()
  );
}

function serializeStage(stage, stageMap) {
  return {
    kwargs: stage.parameters.map((param, i) => [
      param.parameter,
      operate(stageMap[stage.stage][i].type, "castTo", param.value),
    ]),
    _cls: `fiftyone.core.stages.${stage.stage}`,
  };
}

function operate(type, operator, value) {
  return (Array.isArray(type) ? [type[0]] : type.split("|")).reduce(
    (acc, t) => {
      const parser = PARAM_PARSER[t];
      const next = Array.isArray(type) ? type[1] : undefined;
      return parser.validate(value, next) ? parser[operator](value, next) : acc;
    },
    undefined
  );
}

function serializeView(stages, stageMap) {
  if (stages.length === 1 && stages[0].stage === "") return [];
  return stages.map((stage) => serializeStage(stage, stageMap));
}

function setStages(ctx, stageInfo) {
  const viewStr = ctx.stateDescription.view.view;
  const view = JSON.parse(viewStr);
  const stageMap = Object.fromEntries(stageInfo.map((s) => [s.name, s.params]));
  if (viewStr === JSON.stringify(serializeView(ctx.stages, stageMap))) {
    return ctx.stages;
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
        stage.kwargs.map((p, j) => {
          const stageInfoResult = stageInfo.filter(
            (s) => s.name === stageName
          )[0];
          return createParameter(
            stageName,
            p[0],
            stageInfoResult.params[j].type,
            operate(stageInfoResult.params[j].type, "castFrom", p[1]),
            true,
            false,
            j === stageInfoResult.params.length - 1
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
            target: "running",
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
                if (view.length === 0) {
                  const stage = createStage(
                    "",
                    0,
                    e.data.stages,
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
                }
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
          }),
          send("FOCUS"),
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
            activeStage: ({ activeStage }) => activeStage,
            stages: ({ stages }, e) =>
              stages
                .filter(
                  (stage) => stage.id !== e.stage.id || stages.length === 1
                )
                .map((stage, index) => {
                  const newStage = stage.id === e.stage.id ? e.stage : stage;
                  newStage.index = index;
                  newStage.length = Math.max(stages.length - 1, 1);
                  newStage.ref = stage.ref;
                  newStage.stage =
                    e.stage.id === newStage.id ? "" : newStage.stage;
                  newStage.reset = true;
                  return newStage;
                }),
          }),
          "sendStagesUpdate",
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
            stage: stage.stage,
            go: stage.reset,
          })
        ),
      submit: ({
        socket,
        setStateDescription,
        stateDescription,
        stages,
        stageInfo,
      }) => {
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
