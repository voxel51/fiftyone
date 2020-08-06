import { Machine, actions, assign, send, spawn, sendParent } from "xstate";
import uuid from "uuid-v4";

import viewStageParameterMachine from "./viewStageParameterMachine";

const { choose } = actions;

export const createParameter = (
  stage,
  parameter,
  type,
  value,
  submitted,
  focusOnInit,
  tail
) => ({
  id: uuid(),
  parameter: parameter,
  type: type,
  stage: stage,
  value: value ? value : "",
  submitted,
  focusOnInit,
  inputRef: {},
  tail,
});

const viewStageMachine = Machine(
  {
    id: "viewStage",
    context: {
      id: undefined,
      stage: undefined,
      parameters: [],
      prevStage: "",
      stageInfo: undefined,
      index: undefined,
      focusOnInit: undefined,
      length: undefined,
      inputRef: {},
    },
    type: "parallel",
    states: {
      input: {
        initial: "decide",
        states: {
          decide: {
            always: [
              {
                target: "editing",
                cond: (ctx) => ctx.focusOnInit && ctx.inputRef.current,
              },
              {
                target: "waiting",
                cond: (ctx) => ctx.focusOnInit && !ctx.inputRef.current,
              },
              {
                target: "reading.submitted",
                cond: (ctx) => ctx.submitted,
                actions: [
                  sendParent((ctx) => ({
                    type: "STAGE.COMMIT",
                    stage: ctx,
                  })),
                ],
              },
              {
                target: "reading.selected",
                cond: (ctx) => ctx.stage !== "",
              },
              {
                target: "reading.pending",
              },
            ],
          },
          initializing: {
            entry: assign({
              parameters: (ctx) => {
                return ctx.parameters.map((parameter) => ({
                  ...parameter,
                  ref: spawn(
                    viewStageParameterMachine.withContext(parameter),
                    parameter.id
                  ),
                }));
              },
            }),
            always: "decide",
          },
          waiting: {
            on: {
              FOCUS: {
                target: "decide",
                actions: assign({
                  inputRef: (_, { inputRef }) => inputRef,
                }),
              },
            },
          },
          reading: {
            states: {
              pending: {},
              selected: {},
              submitted: {},
            },
            on: {
              EDIT: {
                target: "editing",
              },
              DELETE: {
                target: "deleted",
              },
            },
          },
          editing: {
            entry: [
              assign({
                prevStage: (ctx) => ctx.stage,
                prevSubmitted: (ctx) => ctx.submitted,
              }),
              "focusInput",
              sendParent((ctx) => ({
                type: "SET",
                index: ctx.index,
              })),
            ],
            type: "parallel",
            states: {
              input: {
                initial: "focused",
                states: {
                  focused: {
                    on: {
                      UNFOCUS_INPUT: "unfocused",
                    },
                  },
                  unfocused: {
                    on: {
                      FOCUS_INPUT: "focused",
                    },
                  },
                },
              },
              searchResults: {
                initial: "notHovering",
                states: {
                  hovering: {
                    on: {
                      MOUSELEAVE_RESULTS: "notHovering",
                    },
                  },
                  notHovering: {
                    on: {
                      MOUSEENTER_RESULTS: "hovering",
                    },
                  },
                },
              },
            },
            on: {
              CHANGE: {
                actions: assign({
                  stage: (ctx, e) => e.stage,
                }),
              },
              COMMIT: [
                {
                  target: "reading.selected",
                  actions: [
                    assign({
                      stage: (ctx, { stage }) => stage,
                      parameters: (ctx, { stage }) => {
                        const result = ctx.stageInfo.filter((s) =>
                          s.name.toLowerCase().includes(stage.toLowerCase())
                        )[0].params;
                        const parameters = result.map((parameter, i) =>
                          createParameter(
                            stage,
                            parameter.name,
                            parameter.type,
                            "",
                            false,
                            i === 0,
                            i === result.length - 1
                          )
                        );
                        return parameters.map((parameter) => ({
                          ...parameter,
                          ref: spawn(
                            viewStageParameterMachine.withContext(parameter)
                          ),
                        }));
                      },
                    }),
                    send("UPDATE_DELIBLE"),
                  ],
                  cond: (ctx, e) => {
                    const result = ctx.stageInfo.filter(
                      (s) => s.name.toLowerCase() === e.stage.toLowerCase()
                    );
                    return result.length === 1;
                  },
                },
                {
                  target: "reading.pending",
                  actions: [
                    assign({
                      stage: () => "",
                      submitted: () => false,
                    }),
                    "blurInput",
                  ],
                },
              ],
              BLUR: [
                {
                  target: "reading.pending",
                  actions: [
                    sendParent((ctx) => ({
                      type: "STAGE.DELETE",
                      stage: ctx,
                    })),
                    "blurInput",
                  ],
                  cond: ({ submitted }) => !submitted,
                },
                {
                  target: "reading.pending",
                  actions: [
                    assign({
                      stage: () => "",
                    }),
                    "blurInput",
                  ],
                  cond: (ctx) => !ctx.submitted,
                },
                {
                  target: "reading.submitted",
                  actions: [
                    assign({
                      stage: (ctx) => ctx.prevStage,
                    }),
                  ],
                  cond: (ctx) => ctx.submitted,
                },
              ],
            },
          },
          deleted: {
            onEntry: [
              assign({
                stage: "",
                submitted: false,
              }),
              sendParent((ctx) => ({ type: "STAGE.DELETE", stage: ctx })),
            ],
            always: "reading.pending",
          },
        },
      },
      delible: {
        initial: "decide",
        states: {
          decide: {
            always: [
              {
                target: "yes",
                cond: (ctx) =>
                  ctx.length > 1 || ctx.submitted || ctx.stage !== "",
              },
              { target: "no" },
            ],
          },
          yes: {},
          no: {},
        },
      },
      draggable: {
        initial: "decide",
        states: {
          decide: {
            always: [
              {
                target: "yes",
                cond: (ctx) => ctx.length === 1,
              },
              {
                target: "no",
              },
            ],
          },
          yes: {},
          no: {},
        },
      },
      focusedViewBar: {
        initial: "decide",
        states: {
          decide: {
            always: [
              { target: "yes", cond: (ctx) => ctx.focusOnInit },
              { target: "no" },
            ],
          },
          yes: {},
          no: {},
        },
      },
    },
    on: {
      BAR_FOCUS: "focusedViewBar.yes",
      BAR_BLUR: "focusedViewBar.no",
      UPDATE_DELIBLE: "delible",
      "STAGE.UPDATE": {
        target: ["draggable", "delible"],
        actions: [
          assign({
            index: (_, { index }) => index,
            length: (_, { length }) => length,
            active: (_, { active }) => active,
          }),
        ],
      },
      "STAGE.DELETE": "input.deleted",
      "PARAMETER.COMMIT": {
        target: "input",
        actions: [
          assign({
            parameters: (ctx, e) => {
              return ctx.parameters.map((parameter) => {
                return parameter.id === e.parameter.id
                  ? { ...e.parameter, ref: parameter.ref }
                  : parameter;
              });
            },
          }),
          choose([
            {
              cond: (ctx) =>
                ctx.parameters.reduce((acc, cur) => {
                  return cur.submitted ? acc : acc + 1;
                }, 0) > 0,
              actions: send("EDIT", {
                to: (ctx, e) => {
                  const reducer = (acc, cur, idx) => {
                    return cur.id === e.parameter.id ? idx : acc;
                  };
                  const refIndex = ctx.parameters.reduce(reducer, undefined);
                  let idx = refIndex + 1;
                  while (idx < ctx.parameters.length) {
                    if (!ctx.parameters[idx].submitted) {
                      return ctx.parameters[idx].ref;
                    }
                    idx += 1;
                  }
                  idx = refIndex - 1;
                  while (idx) {
                    if (!ctx.parameters[idx].submitted) {
                      return ctx.parameters[idx].ref;
                    }
                    idx -= 1;
                  }
                },
              }),
            },
            {
              cond: (ctx) =>
                ctx.parameters.reduce(
                  (acc, cur) => (cur.submitted ? acc : acc + 1),
                  0
                ) === 0,
              actions: assign({
                submitted: true,
                focusOnInit: false,
              }),
            },
          ]),
        ],
      },
    },
  },
  {
    actions: {
      focusInput: () => {},
      blurInput: () => {},
    },
  }
);

export default viewStageMachine;
