import { v4 as uuid } from "uuid";
import { actions, assign, createMachine, send, spawn } from "xstate";

import { viewsAreEqual } from "@fiftyone/state";
import { getFetchFunction } from "@fiftyone/utilities";
import viewStageMachine, {
  createParameter,
} from "./ViewStage/viewStageMachine";
import { PARSER as PARAM_PARSER } from "./ViewStage/viewStageParameterMachine";

const { choose } = actions;

export const createStage = (
  fieldNames,
  id,
  stage,
  index,
  stageInfo,
  focusOnInit,
  length,
  active,
  parameters,
  submitted,
  loading,
  prevStage,
  added?
) => ({
  id: id || uuid(),
  stage: stage,
  parameters: parameters,
  stageInfo: stageInfo,
  index: index,
  focusOnInit: focusOnInit,
  length: length,
  active: active,
  inputRef: {},
  submitted: submitted,
  loading: loading,
  fieldNames: fieldNames,
  prevStage: prevStage || "",
  added: added || false,
});

function getStageInfo(context) {
  return getFetchFunction()("GET", "/stages");
}

function serializeStage(stage, stageMap, fieldNames) {
  return {
    kwargs: stage.parameters.map((param, i) => {
      return [
        param.parameter,
        operate(
          stageMap[stage.stage][i].type,
          "castTo",
          param.value,
          true,
          fieldNames
        ),
      ];
    }),
    _uuid: stage.id,
    _cls: `fiftyone.core.stages.${stage.stage}`,
  };
}

function operate(type, operator, value, isString = true, fieldNames) {
  return type.split("|").reduce((acc, t) => {
    if (acc !== undefined) return acc;
    const parser = PARAM_PARSER[t];
    try {
      if (
        parser.validate(
          !isString ? parser.castFrom(value, fieldNames) : value,
          fieldNames
        )
      ) {
        return parser[operator](value, fieldNames);
      }
    } catch {}

    return acc;
  }, undefined);
}

function serializeView(stages, stageMap, fieldNames) {
  if (stages.length === 1 && stages[0].stage === "") return [];
  return stages.map((stage) => serializeStage(stage, stageMap, fieldNames));
}

function makeEmptyView(fieldNames, stageInfo) {
  const stage = createStage(
    fieldNames,
    null,
    "",
    0,
    stageInfo,
    false,
    1,
    true,
    [],
    false,
    false,
    ""
  );
  return [
    {
      ...stage,
      ref: spawn(viewStageMachine.withContext(stage)),
    },
  ];
}

function setStages(ctx, stageInfo) {
  const view = ctx.view;
  const stageMap = Object.fromEntries(stageInfo.map((s) => [s.name, s.params]));
  if (
    viewsAreEqual(view, serializeView(ctx.stages, stageMap, ctx.fieldNames))
  ) {
    return ctx.stages;
  } else if (view.length === 0) {
    return makeEmptyView(ctx.fieldNames, stageInfo);
  } else {
    return view.map((stage, i) => {
      let stageName = stage._cls.split(".");
      stageName = stageName[stageName.length - 1];
      const newStage = createStage(
        ctx.fieldNames,
        stage._uuid,
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
            ctx.fieldNames,
            stageName,
            p[0],
            stageInfoResult.params[j].type,
            stageInfoResult.params[j].default,
            operate(
              stageInfoResult.params[j].type,
              "castFrom",
              p[1],
              typeof p[1] === "string",
              ctx.fieldNames
            ),
            true,
            false,
            j === stageInfoResult.params.length - 1,
            i === Math.min(view.length - 1, ctx.activeStage),
            stageInfoResult.params[j].placeholder
          );
        }),
        true,
        true,
        ctx.stages[i - 1]
      );
      return {
        ...newStage,
        ref: spawn(viewStageMachine.withContext(newStage)),
      };
    });
  }
}

const viewBarMachine = createMachine(
  {
    id: "stages",
    context: {
      stages: [],
      stageInfo: undefined,
      activeStage: 0,
      view: undefined,
      setView: undefined,
      http: undefined,
      fieldNames: [],
    },
    initial: "initializing",
    states: {
      decide: {
        always: [
          {
            target: "running.hist",
            cond: (ctx) => ctx.stageInfo && ctx.view,
            actions: [
              assign({
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
              stageInfo: (_, e) => e.data.stages,
              stages: (ctx, e) => {
                const view = ctx.view;
                if (view.length === 0)
                  return makeEmptyView(ctx.fieldNames, e.data.stages);
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
                          Math.max(
                            Math.ceil(activeStage - 1),
                            stages.length - 1
                          ),
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
                            return stages[activeStage].ref.send({
                              type: "EDIT",
                            });
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
                ctx.fieldNames,
                null,
                "",
                index,
                ctx.stageInfo,
                true,
                ctx.stages.length + 1,
                true,
                [],
                false,
                false,
                ctx.stages[index - 1]
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
                ctx.fieldNames,
                null,
                "",
                0,
                ctx.stageInfo,
                false,
                0,
                true,
                [],
                false,
                false,
                ""
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
            stages: ({ fieldNames, stages, stageInfo }, e) => {
              if (stages.length === 1 && stages[0].id === e.stage.id) {
                const stage = createStage(
                  fieldNames,
                  null,
                  "",
                  0,
                  stageInfo,
                  false,
                  0,
                  true,
                  [],
                  false,
                  false,
                  ""
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
            http: (_, { http }) => http,
            view: (_, { view }) => view,
            setView: (_, { setView }) => setView,
            fieldNames: (_, { fieldNames }) => fieldNames,
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
            fieldNames: ctx.fieldNames,
          })
        );
      },
      submit: ({ stages, stageInfo, fieldNames, setView, view }) => {
        const stageMap = Object.fromEntries(
          stageInfo.map((s) => [s.name, s.params])
        );
        const newView = serializeView(stages, stageMap, fieldNames);
        if (viewsAreEqual(newView, view)) return;
        setView(newView);
      },
    },
  }
);

export default viewBarMachine;
