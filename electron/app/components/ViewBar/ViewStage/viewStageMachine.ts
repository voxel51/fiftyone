import { Machine, actions, assign, send, spawn, sendParent } from "xstate";
import uuid from "uuid-v4";

import viewStageParameterMachine from "./viewStageParameterMachine";

const { choose } = actions;

export const createParameter = (
  stage,
  parameter,
  type,
  defaultValue,
  value,
  submitted,
  focusOnInit,
  tail
) => ({
  id: uuid(),
  defaultValue,
  parameter: parameter,
  type: type,
  stage: stage,
  value: value ? value : "",
  submitted,
  focusOnInit,
  inputRef: {},
  tail,
  currentResult: null,
  results: [],
});

const isValidStage = (stageInfo, stage) => {
  return stageInfo
    .map((s) => s.name)
    .some((n) => n.toLowerCase() === stage.toLowerCase());
};

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
          hist: {
            type: "history",
          },
          decide: {
            always: [
              {
                target: "initializing",
                cond: (ctx) => {
                  return ctx.parameters.length && !ctx.parameters[0].ref;
                },
              },
              {
                target: "waiting",
                cond: (ctx) => !ctx.inputRef,
              },
              {
                target: "editing",
                cond: ({ focusOnInit }) => focusOnInit,
              },
              {
                target: "reading",
              },
            ],
          },
          initializing: {
            entry: assign({
              parameters: (ctx) => {
                return ctx.parameters.map((parameter) => ({
                  ...parameter,
                  ref: spawn(viewStageParameterMachine.withContext(parameter)),
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
            entry: "blurInput",
            initial: "decide",
            states: {
              decide: {
                always: [
                  {
                    target: "pending",
                    cond: (ctx) => !isValidStage(ctx.stageInfo, ctx.stage),
                  },
                  {
                    target: "selected",
                  },
                ],
              },
              hist: {
                type: "history",
              },
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
                results: ({ stageInfo, stage }) =>
                  stageInfo
                    .map((s) => s.name)
                    .filter((n) =>
                      n.toLowerCase().includes(stage.toLowerCase())
                    ),
                currentResult: null,
                focusOnInit: true,
              }),
            ],
            type: "parallel",
            states: {
              input: {
                initial: "focused",
                states: {
                  focused: {
                    entry: "focusInput",
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
                  stage: (_, e) => e.value,
                  results: ({ stageInfo }, e) =>
                    stageInfo
                      .map((s) => s.name)
                      .filter((n) =>
                        n.toLowerCase().includes(e.value.toLowerCase())
                      ),
                  currentResult: null,
                  errorId: undefined,
                }),
              },
              COMMIT: [
                {
                  target: "reading.selected",
                  actions: [
                    assign({
                      focusOnInit: false,
                      stage: (ctx, { value }) => value,
                      parameters: (ctx, { value }) => {
                        const result = ctx.stageInfo.filter((s) =>
                          s.name.toLowerCase().includes(value.toLowerCase())
                        )[0].params;
                        const parameters = result.map((parameter, i) =>
                          createParameter(
                            value,
                            parameter.name,
                            parameter.type,
                            parameter.default,
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
                      errorId: undefined,
                    }),
                    send("UPDATE_DELIBLE"),
                  ],
                  cond: (ctx, e) => {
                    const result = ctx.stageInfo.filter(
                      (s) => s.name.toLowerCase() === e.value.toLowerCase()
                    );
                    return result.length === 1;
                  },
                },
                {
                  actions: [
                    assign({
                      submitted: () => false,
                      error: (_, { value }) => ({
                        name: "stage",
                        error: `${
                          value === "" ? '""' : value
                        } is not a valid stage`,
                      }),
                      errorId: uuid(),
                    }),
                  ],
                },
              ],
              BLUR: [
                {
                  target: "reading.pending",
                  actions: [
                    assign({
                      stage: () => "",
                      errorId: undefined,
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
                      errorId: undefined,
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
                parameters: [],
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
      CLEAR_ERROR: {
        actions: [
          assign({
            error: undefined,
          }),
        ],
      },
      CLEAR_ERROR_ID: {
        actions: [
          assign({
            errorId: undefined,
          }),
        ],
      },
      NEXT_RESULT: {
        actions: assign({
          currentResult: ({ currentResult, results }) => {
            if (currentResult === null) return 0;
            return Math.min(currentResult + 1, results.length - 1);
          },
          stage: ({ currentResult, results }) => {
            if (currentResult === null) return results[0];
            return results[Math.min(currentResult + 1, results.length - 1)];
          },
        }),
      },
      PREVIOUS_RESULT: {
        actions: assign({
          currentResult: ({ currentResult }) => {
            if (currentResult === 0 || currentResult === null) return null;
            return currentResult - 1;
          },
          stage: ({ currentResult, prevStage, results }) => {
            if (currentResult === 0 || currentResult === null) return prevStage;
            return results[currentResult - 1];
          },
        }),
      },
      BAR_FOCUS: "focusedViewBar.yes",
      BAR_BLUR: "focusedViewBar.no",
      UPDATE_DELIBLE: "delible",
      "STAGE.UPDATE": {
        target: ["draggable", "delible", "input"],
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
                  while (idx >= 0) {
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
              actions: [
                assign({
                  submitted: true,
                  focusOnInit: false,
                }),
                sendParent((ctx) => ({ type: "STAGE.COMMIT", stage: ctx })),
              ],
            },
          ]),
        ],
      },
      "PARAMETER.EDIT": {
        actions: [
          sendParent((ctx) => ({ type: "STAGE.EDIT", index: ctx.index })),
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
