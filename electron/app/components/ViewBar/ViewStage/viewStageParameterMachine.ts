import { Machine, actions, sendParent, send } from "xstate";
import viewStageMachine from "./viewStageMachine";
const { assign, choose } = actions;

/**
 * See https://stackoverflow.com/questions/175739/built-in-way-in-javascript-to-check-if-a-string-is-a-valid-number
 * for details about numbers and javascript
 */
export const PARSER = {
  bool: {
    cast: (value) => ["true", "false"].indexOf(value.toLowerCase()) === 0,
    parse: (value) => {
      return (
        value.toLowerCase().charAt(0).toUpperCase() +
        value.toLowerCase().slice(1)
      );
    },
    validate: (value) => ["true", "false"].indexOf(value.toLowerCase()) >= 0,
  },
  float: {
    cast: (value) => +value,
    parse: (value) => {
      const stripped = value.replace(/[\s]/g, "");
      const [integer, fractional] = stripped.split(".");
      return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + fractional;
    },
    validate: (value) => {
      const stripped = value.replace(/[\s]/g, "");
      return stripped !== "" && !isNaN(+stripped);
    },
  },
  int: {
    cast: (value) => +value,
    parse: (value) =>
      value.replace(/[,\s]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ","),
    validate: (value) => /^\d+$/.test(value.replace(/[,\s]/g, "")),
  },
  list: {
    cast: (value, next) => JSON.parse(value).map((e) => PARSER[next].cast(e)),
    parse: (value, next) => {
      const array = JSON.parse(value);
      return JSON.stringify(array.map((e) => PARSER[next].parse(e)));
    },
    validate: (value, next) => {
      try {
        const array = JSON.parse(value);
        return (
          Array.isArray(array) && array.every((e) => PARSER[next].validate(e))
        );
      } catch {
        return false;
      }
    },
  },
  str: {
    cast: (value) => value,
    parse: (value) => value,
    validate: () => true,
  },
  dict: {
    cast: (value) => JSON.parse(value),
    parse: (value) => value,
    validate: (value) => {
      try {
        return JSON.parse(value) instanceof Object;
      } catch {
        return false;
      }
    },
  },
};

export default Machine(
  {
    id: "viewStageParameter",
    initial: "decide",
    context: {
      id: undefined,
      parameter: undefined,
      stage: undefined,
      type: undefined,
      value: undefined,
      submitted: undefined,
      tail: undefined,
      focusOnInit: undefined,
    },
    states: {
      decide: {
        always: [
          {
            target: "editing",
            cond: (ctx) => ctx.focusOnInit,
          },
          {
            target: "reading.submitted",
            cond: (ctx) => ctx.submitted,
          },
          {
            target: "reading.pending",
          },
        ],
      },
      reading: {
        initial: "pending",
        entry: "blurInput",
        states: {
          pending: {},
          submitted: {},
        },
        on: {
          EDIT: "editing",
        },
      },
      editing: {
        entry: [
          assign({
            prevValue: ({ value }) => value,
            focusOnInit: false,
          }),
          "focusInput",
        ],
        on: {
          CHANGE: {
            actions: [
              assign({
                value: (_, { value }) => value,
              }),
            ],
          },
          COMMIT: [
            {
              target: "decide",
              actions: [
                assign({
                  submitted: true,
                  value: ({ type, value }) =>
                    (Array.isArray(type) ? [type[0]] : type.split("|")).reduce(
                      (acc, t) => {
                        const parser = PARSER[t];
                        const next = Array.isArray(type) ? type[1] : undefined;
                        return parser.validate(value, next)
                          ? parser.parse(value, next)
                          : acc;
                      },
                      undefined
                    ),
                }),
                sendParent((ctx) => ({
                  type: "PARAMETER.COMMIT",
                  parameter: ctx,
                })),
              ],
              cond: ({ type, value }) =>
                (Array.isArray(type) ? [type[0]] : type.split("|")).some((t) =>
                  PARSER[t].validate(
                    value,
                    Array.isArray(type) ? type[1] : undefined
                  )
                ),
            },
            {
              target: "decide",
              actions: assign({
                value: ({ prevValue }) => prevValue,
              }),
            },
          ],
          CANCEL: {
            target: "reading",
            actions: [
              assign({
                value: ({ prevValue }) => prevValue,
              }),
            ],
          },
        },
      },
    },
    on: {
      BLUR: [
        {
          target: "reading.pending",
          cond: ({ submitted, prevValue }) => !submitted && prevValue !== "",
          actions: [
            assign({
              value: ({ prevValue }) => prevValue,
            }),
          ],
        },
        {
          target: "reading.pending",
          cond: ({ submitted, prevValue }) => !submitted && prevValue === "",
          actions: sendParent("STAGE.DELETE"),
        },
        {
          target: "reading.submitted",
          cond: ({ submitted }) => submitted,
        },
      ],
    },
  },
  {
    actions: {
      blurInput: () => {},
      focusInput: () => {},
    },
  }
);
