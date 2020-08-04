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
  tail,
  focusOnInit
) => {
  return {
    id: uuid(),
    parameter: parameter,
    type: type,
    stage: stage,
    value: value ? value : "",
    submitted,
    tail,
    focusOnInit,
    inputRef: {},
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
    initial: "decide",
    states: {
      decide: {
        always: [
          {
            target: "editing",
            cond: (ctx) => {
              return ctx.focusOnInit;
            },
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
      reading: {
        states: {
          pending: {},
          selected: {},
          submitted: {
            exit: assign({
              insertAt: undefined,
            }),
          },
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
        onEntry: [
          assign({
            prevStage: (ctx) => ctx.stage,
            prevSubmitted: (ctx) => ctx.submitted,
            focusOnInit: false,
          }),
          "focusInput",
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
                        i === result.length - 1,
                        i === 0
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
                sendParent(({ id }) => ({
                  type: "STAGE.DELETE",
                  id,
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
          }),
          sendParent((ctx) => ({ type: "STAGE.DELETE", id: ctx.id })),
        ],
      },
    },
    on: {
      "STAGE.DELETE": "deleted",
      "PARAMETER.COMMIT": {
        target: "decide",
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
                submitted: () => true,
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
