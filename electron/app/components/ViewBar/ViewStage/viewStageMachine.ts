import { Machine, actions, assign, spawn, sendParent } from "xstate";
import uuid from "uuid-v4";

import viewStageParameterMachine, {
  viewStageParameterMachineConfig,
} from "./viewStageParameterMachine";

const { pure } = actions;

export const createParameter = (stage, parameter, type, value, submitted) => {
  return {
    id: uuid(),
    parameter: parameter,
    type: type,
    stage: stage,
    value: value ? value : "",
    submitted,
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
              ref: spawn(viewStageParameterMachine.withContext(parameter)),
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
                const parameters = ctx.stageInfo
                  .filter((s) =>
                    s.name.toLowerCase().includes(ctx.stage.toLowerCase())
                  )[0]
                  .params.map((parameter) =>
                    createParameter(
                      ctx.stage,
                      parameter.name,
                      parameter.type,
                      ""
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
                    ).withContext(parameter)
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
            actions: assign({ stage: (ctx) => ctx.prevStage }),
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
              sendParent("STAGE.COMMIT", { stage: ctx });
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
