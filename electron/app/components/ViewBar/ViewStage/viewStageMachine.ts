import { Machine, actions, assign, spawn, sendParent } from "xstate";
import uuid from "uuid-v4";

import viewStageParameterMachine, {
  viewStageParameterMachineConfig,
} from "./viewStageParameterMachine";

const { pure } = actions;

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
        },
        on: {
          EDIT: {
            target: "editing",
            actions: "focusInput",
          },
        },
      },
      editing: {
        onEntry: assign({ prevStage: (ctx) => ctx.stage }),
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
              target: "reading",
              actions: assign({
                stage: ({ prevStage }) => prevStage,
              }),
            },
          ],
          CANCEL: {
            target: "reading",
            actions: [assign({ stage: (ctx) => ctx.prevStage }), "blurInput"],
          },
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
        target: "submitted",
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
          pure((ctx) => {
            if (ctx.parameters.every((p) => p.submitted)) {
              send({ type: "STAGE.COMMIT", stage: ctx });
            } else {
            }
          }),
        ],
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
