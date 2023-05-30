import { v4 as uuid } from "uuid";
import { actions, Machine, sendParent } from "xstate";

import { computeBestMatchString, getMatch } from "./utils";

const { assign } = actions;

const convert = (v) => (typeof v !== "string" ? String(v) : v);

export const toTypeAnnotation = (type: string): string => {
  if (type.includes("|")) {
    return [
      "Union[",
      type
        .split("|")
        .map((t) => toTypeAnnotation(t))
        .join(", "),
      "]",
    ].join("");
  } else if (type === "list<str>") {
    return "List[str]";
  } else if (type === "list<id>") {
    return "List[id]";
  } else return type;
};

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
  field: {
    castFrom: (value) => value,
    castTo: (value) => value,
    parse: (value, fields) =>
      fields.filter((f) => f.toLowerCase() === value.toLowerCase())[0],
    validate: (value, fields) =>
      typeof value === "string" && fields.includes(value.toLowerCase()),
  },
  dict: {
    castFrom: (value) => JSON.stringify(value, null, 2),
    castTo: (value) => (typeof value === "string" ? JSON.parse(value) : value),
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
  id: {
    castFrom: (value) => value,
    castTo: (value) => value,
    parse: (value) => value,
    validate: (value) => /[0-9A-Fa-f]{24}/g.test(value),
  },
  int: {
    castFrom: (value) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ","),
    castTo: (value) => +value.replace(/[,\s]/g, ""),
    parse: (value) =>
      String(+value.replace(/[,\s]/g, "")).replace(
        /\B(?=(\d{3})+(?!\d))/g,
        ","
      ),
    validate: (value) => /^\d+$/.test(convert(value).replace(/[,\s]/g, "")),
  },
  json: {
    castFrom: (value) => JSON.stringify(value, null, 2),
    castTo: (value) => (typeof value === "string" ? JSON.parse(value) : value),
    parse: (value) => value,
    validate: (value) => {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    },
  },
  "list<field>": {
    castFrom: (value) => value.join(","),
    castTo: (value) => value.split(","),
    parse: (value) => value.replace(/[\s\'\"\[\]]/g, ""),
    validate: (value, fields) => {
      const stripped = value.replace(/[\s]/g, "");
      let array = null;
      try {
        array = JSON.parse(stripped);
      } catch {
        array = stripped.split(",");
      }
      return (
        typeof value !== "string" &&
        Array.isArray(array) &&
        array.every((e) => PARSER.field.validate(e, fields))
      );
    },
  },
  "list<id>": {
    castFrom: (value) => value.join(","),
    castTo: (value) => value.split(","),
    parse: (value) => value.replace(/[\s\'\"\[\]]/g, ""),
    validate: (value) => {
      const stripped = value.replace(/[\s]/g, "");
      let array = null;
      try {
        array = JSON.parse(stripped);
      } catch {
        array = stripped.split(",");
      }
      return (
        typeof value !== "string" &&
        Array.isArray(array) &&
        array.every((e) => PARSER.id.validate(e))
      );
    },
  },
  "list<str>": {
    castFrom: (value) => value.join(","),
    castTo: (value) => value.split(","),
    parse: (value) =>
      value
        // replace spaces with a single space (to allow search by words with spaces)
        .replace(/[\s\'\"\[\]]+/g, " ")
        // replace comma followed by trailing spaces with a single comma
        .replace(/,\s*/g, ",")
        // remove trailing spaces
        .replace(/[ \t]+$/, ""),
    validate: (value) => {
      const stripped = value.replace(/[\s]/g, "");
      let array = null;
      try {
        array = JSON.parse(stripped);
      } catch {
        // ex: exclude_fields('a, b'). 'a,b' => ['a', 'b']
        array = stripped.split(",");
      }
      return (
        typeof array !== "string" &&
        Array.isArray(array) &&
        array.every((e) => PARSER.str.validate(e))
      );
    },
  },
  NoneType: {
    castFrom: (value) => (value === null ? "None" : value),
    castTo: () => null,
    parse: () => "None",
    validate: (value) => [null, "None", ""].some((v) => value === v),
  },
  str: {
    castFrom: (value) => value,
    castTo: (value) => value,
    parse: (value) => value,
    validate: (value) => {
      if (typeof value !== "string") {
        return false;
      }
      try {
        JSON.parse(value);
        return false;
      } catch {
        return true;
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
      defaultValue: undefined,
      parameter: undefined,
      stage: undefined,
      type: undefined,
      value: "",
      submitted: undefined,
      tail: undefined,
      focusOnInit: undefined,
      error: undefined,
      fieldNames: [],
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
          sendParent("PARAMETER.EDIT"),
          assign({
            bestMatch: ({ fieldNames, value, type }) =>
              type === "field" ? computeBestMatchString(fieldNames, value) : {},
            currentResult: null,
            prevValue: ({ value }) => value,
            focusOnInit: false,
            results: ({ type, fieldNames, value }) =>
              type === "field"
                ? fieldNames.filter((f) =>
                    f.toLowerCase().startsWith(value.toLowerCase())
                  )
                : [],
          }),
          "focusInput",
        ],
        initial: "notHovering",
        states: {
          hovering: {
            on: {
              MOUSELEAVE: "notHovering",
            },
          },
          notHovering: {
            on: {
              MOUSEENTER: "hovering",
            },
          },
        },
        on: {
          CHANGE: {
            actions: [
              assign({
                bestMatch: ({ fieldNames, type }, { value }) =>
                  type === "field"
                    ? computeBestMatchString(fieldNames, value)
                    : {},
                currentResult: null,
                value: (_, { value }) => value,
                errorId: undefined,
                results: ({ type, fieldNames }, { value }) =>
                  type === "field"
                    ? fieldNames.filter((f) =>
                        f.toLowerCase().startsWith(value.toLowerCase())
                      )
                    : [],
              }),
            ],
          },
          COMMIT: [
            {
              target: "decide",
              actions: [
                assign({
                  submitted: true,
                  value: (
                    { type, value, defaultValue, fieldNames, bestMatch },
                    { value: eventValue }
                  ) => {
                    const match =
                      type === "field" ? getMatch(fieldNames, value) : null;
                    value = eventValue ? eventValue : value;
                    value = match
                      ? match
                      : bestMatch.value
                      ? bestMatch.value
                      : value;
                    return value === "" && defaultValue
                      ? defaultValue
                      : type.split("|").reduce((acc, t) => {
                          if (acc !== undefined) return acc;
                          const parser = PARSER[t];
                          return parser.validate(value, fieldNames)
                            ? parser.parse(value, fieldNames)
                            : acc;
                        }, undefined);
                  },
                  errorId: undefined,
                  bestMatch: {},
                }),
                "blurInput",
                sendParent((ctx) => ({
                  type: "PARAMETER.COMMIT",
                  parameter: ctx,
                })),
              ],
              cond: (
                { type, fieldNames, value, defaultValue, bestMatch },
                { value: eventValue }
              ) => {
                value = eventValue ? eventValue : value;
                const match =
                  type === "field" ? getMatch(fieldNames, value) : null;
                value = match
                  ? match
                  : bestMatch.value
                  ? bestMatch.value
                  : value;
                return (
                  (value === "" && defaultValue) ||
                  type
                    .split("|")
                    .some((t) => PARSER[t].validate(value, fieldNames))
                );
              },
            },
            {
              actions: [
                assign({
                  error: ({ type }) => ({
                    name: "value",
                    error: `Expected type "${toTypeAnnotation(type)}"`,
                  }),
                  errorId: uuid(),
                }),
              ],
            },
          ],
          CANCEL: {
            target: "reading.pending",
            actions: [
              assign({
                value: ({ prevValue }) => prevValue,
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
              value: ({ currentResult, results }) => {
                if (currentResult === null) return results[0];
                return results[Math.min(currentResult + 1, results.length - 1)];
              },
              bestMatch: {},
            }),
          },
          PREVIOUS_RESULT: {
            actions: assign({
              currentResult: ({ currentResult }) => {
                if (currentResult === 0 || currentResult === null) return null;
                return currentResult - 1;
              },
              value: ({ currentResult, prevValue, results }) => {
                if (currentResult === 0 || currentResult === null)
                  return prevValue;
                return results[currentResult - 1];
              },
              bestMatch: {},
            }),
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
          target: "reading.submitted",
          cond: ({ submitted }) => submitted,
        },
      ],
      FOCUS: {
        actions: "focusInput",
      },
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
      UPDATE: {
        actions: assign({
          active: (_, { active }) => active,
        }),
      },
    },
  },
  {
    actions: {
      blurInput: () => {},
      focusInput: () => {},
    },
  }
);
