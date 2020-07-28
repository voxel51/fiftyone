import { Machine, actions, assign, send, spawn, sendParent } from "xstate";
import uuid from "uuid-v4";

import viewStageParameterMachine, {
  viewStageParameterMachineConfig,
} from "./viewStageParameterMachine";

const { choose } = actions;

export const createParameter = (
  stage,
  parameter,
  type,
  value,
  submitted,
  tail
) => {
  return {
    id: uuid(),
    parameter: parameter,
    type: type,
    stage: stage,
    value: value ? value : "",
    submitted,
    tail,
  };
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
      insertAt: undefined,
    },
    initial: "initializing",
    states: {
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
        always: "reading",
      },
      reading: {
        initial: "unknown",
        states: {
          unknown: {
            always: [
              { target: "selected", cond: (ctx) => ctx.stage !== "" },
              { target: "pending" },
            ],
          },
          pending: {},
          selected: {
            entry: assign({
              parameters: (ctx) => {
                const result = ctx.stageInfo.filter((s) =>
                  s.name.toLowerCase().includes(ctx.stage.toLowerCase())
                )[0].params;
                const parameters = result.map((parameter, i) =>
                  createParameter(
                    ctx.stage,
                    parameter.name,
                    parameter.type,
                    "",
                    false,
                    i === result.length - 1
                  )
                );
                return parameters.map((parameter, i) => ({
                  ...parameter,
                  ref: spawn(
                    (i === 0
                      ? Machine({
                          ...viewStageParameterMachineConfig,
                          initial: "editing",
                        })
                      : viewStageParameterMachine
                    ).withContext(parameter),
                    parameter.id
                  ),
                }));
              },
            }),
          },
          submitted: {},
          hist: {
            type: "history",
          },
          validate: {
            always: [
              {
                target: "submitted",
                cond: (ctx) => ctx.parameters.every((p) => p.submitted),
                actions: send((ctx) => ({ type: "STAGE.COMMIT" })),
              },
              {
                target: "selected",
                cond: (ctx) => !ctx.parameters.every((p) => p.submitted),
                actions: send((ctx, e) => {
                  const reducer = (acc, cur, idx) => {
                    console.log(cur, e);
                    return cur.id === e.parameter.id ? idx : acc;
                  };
                  const refIndex = ctx.parameters.reduce(reducer, undefined);
                  let idx = refIndex + 1;
                  while (idx < ctx.parameters.length) {
                    if (!ctx.parameters[idx].submitted) {
                      return {
                        type: "EDIT_PARAMETER",
                        parameter: ctx.parameters[idx],
                      };
                    }
                    idx += 1;
                  }
                  idx = refIndex - 1;
                  while (true) {
                    if (!ctx.parameters[idx].submitted) {
                      return {
                        type: "EDIT_PARAMETER",
                        parameter: ctx.parameters[idx],
                      };
                    }
                    idx -= 1;
                  }
                }),
              },
            ],
          },
        },
        on: {
          EDIT: {
            target: "editing",
            actions: "focusInput",
          },
          SUBMIT: {
            target: "reading.submitted",
            actions: sendParent((ctx) => ({
              type: "STAGE.COMMIT",
              stage: ctx,
            })),
          },
          EDIT_PARAMETER: {
            target: "reading.pending",
            actions: send((ctx, e) => ({ type: "EDIT", to: e.parameter.ref })),
          },
        },
      },
      editing: {
        onEntry: assign({
          prevStage: (ctx) => ctx.stage,
          prevSubmitted: (ctx) => ctx.submitted,
        }),
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
                }),
              ],
              cond: (ctx, e) => {
                console.log(ctx, e);
                const result = ctx.stageInfo.filter(
                  (s) => s.name.toLowerCase() === e.stage.toLowerCase()
                );
                return result.length === 1;
              },
            },
            {
              target: "hist",
              actions: [
                assign({
                  stage: (ctx) => ctx.prevStage,
                }),
              ],
            },
            {
              target: "reading",
              actions: [
                assign({
                  stage: (ctx, { prevStage }) => prevStage,
                }),
              ],
            },
          ],
          BLUR: [
            {
              target: "reading.hist",
              actions: assign({
                stage: ({ prevStage }) => prevStage,
                submitted: ({ prevSubmitted }) => prevSubmitted,
              }),
              cond: (ctx) => ctx.prevSubmitted,
            },
            {
              target: "reading.pending",
              actions: assign({
                stage: () => "",
                submitted: () => false,
              }),
            },
          ],
        },
      },
      deleted: {
        onEntry: sendParent((ctx) => ({ type: "STAGE.DELETE", id: ctx.id })),
      },
      hist: {
        type: "history",
        history: "deep",
      },
    },
    on: {
      "PARAMETER.COMMIT": {
        target: "reading.validate",
        actions: assign({
          parameters: (ctx, e) => {
            return ctx.parameters.map((parameter) => {
              return parameter.id === e.parameter.id
                ? { ...e.parameter, ref: parameter.ref }
                : parameter;
            });
          },
        }),
      },
    },
  },
  {
    actions: {
      focusInput: () => {},
    },
  }
);

export default viewStageMachine;
