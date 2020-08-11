import { Machine, actions, sendParent, send } from "xstate";
import viewStageMachine from "./viewStageMachine";
const { assign, choose } = actions;

const convert = (v) => (typeof v !== "string" ? String(v) : v);

/**
 * See https://stackoverflow.com/questions/175739/built-in-way-in-javascript-to-check-if-a-string-is-a-valid-number
 * for details about numbers and javascript
 */
export const PARSER = {
  bool: {
    castFrom: (value) => (value ? "True" : "False"),
    castTo: (value) => ["true", "false"].indexOf(value.toLowerCase()) === 0,
    parse: (value) => {
      return (
        value.toLowerCase().charAt(0).toUpperCase() +
        value.toLowerCase().slice(1)
      );
    },
    validate: (value) =>
      ["true", "false"].indexOf(convert(value).toLowerCase()) >= 0,
  },
  float: {
    castFrom: (value) => String(value),
    castTo: (value) => +value,
    parse: (value) => {
      const stripped = value.replace(/[\s]/g, "");
      const [integer, fractional] = stripped.split(".");
      return (
        integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
        (fractional ? "." + fractional : "")
      );
    },
    validate: (value) => {
      const stripped = convert(value).replace(/[\s]/g, "");
      return stripped !== "" && !isNaN(+stripped);
    },
  },
  int: {
    castFrom: (value) => String(value),
    castTo: (value) => +value,
    parse: (value) =>
      value.replace(/[,\s]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ","),
    validate: (value) => /^\d+$/.test(convert(value).replace(/[,\s]/g, "")),
  },
  list: {
    castFrom: (value, next) => {
      return JSON.stringify(value);
    },
    castTo: (value, next) =>
      JSON.parse(value).map((e) => PARSER[next].castTo(e)),
    parse: (value, next) => {
      const array = JSON.parse(value);
      return JSON.stringify(array.map((e) => PARSER[next].parse(e)));
    },
    validate: (value, next) => {
      const array = typeof value === "string" ? JSON.parse(value) : value;
      return (
        Array.isArray(array) && array.every((e) => PARSER[next].validate(e))
      );
    },
  },
  str: {
    castFrom: (value) => value,
    castTo: (value) => value,
    parse: (value) => value,
    validate: () => true,
  },
  dict: {
    castFrom: (value) => JSON.stringify(value),
    castTo: (value) => JSON.parse(value),
    parse: (value) => value,
    validate: (value) => {
      try {
        const v = typeof value === "string" ? JSON.parse(value) : value;
        return v instanceof Object && !Array.isArray(value);
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
            value: ({ value }) =>
              PARSER.dict.validate(value)
                ? JSON.stringify(JSON.parse(value), null, 2)
                : value,
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
              cond: ({ type, value }) => {
                return (Array.isArray(type)
                  ? [type[0]]
                  : type.split("|")
                ).some((t) =>
                  PARSER[t].validate(
                    value,
                    Array.isArray(type) ? type[1] : undefined
                  )
                );
              },
            },
            {
              target: "decide",
              actions: assign({
                value: ({ prevValue }) => prevValue,
              }),
            },
          ],
          CANCEL: {
            target: "decide",
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
