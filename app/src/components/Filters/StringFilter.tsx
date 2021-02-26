import React, { useContext, useEffect, useRef } from "react";
import { Checkbox, FormControlLabel } from "@material-ui/core";
import {
  RecoilState,
  RecoilValueReadOnly,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import styled, { ThemeContext } from "styled-components";
import { Machine, assign } from "xstate";
import { useMachine } from "@xstate/react";
import uuid from "uuid-v4";

import SearchResults from "../ViewBar/ViewStage/SearchResults";
import { useOutsideClick } from "../../utils/hooks";

const NONE = [null, undefined];

const NONE_SORT = (a, b) => {
  if (a === null) {
    return -1;
  }
  if (b === null) {
    return 1;
  }
  return a - b;
};

const translateNone = (values) => {
  return values.map((v) => (NONE.includes(v) ? [v, "none"] : [v, v]));
};

const matchValues = (values, value) => {
  return translateNone(values)
    .filter((c) => c[1].toLowerCase().includes(value))
    .map((v) => v[0]);
};

const updateSelected = ({ selected, values }, { value, click }) => {
  if (
    (typeof value === "string" &&
      !values.filter((v) => !selected.includes(v)).some((c) => c === value)) ||
    NONE.includes(value)
  ) {
    value = null;
  }
  return [...new Set([...selected, value])].sort(NONE_SORT);
};

const canCommit = ({ values }, { value }) => {
  return (
    (NONE.includes(value) && values.includes(null)) ||
    translateNone(values).some((c) => c[1] === value)
  );
};

const commitActions = {
  actions: [
    assign({
      selected: updateSelected,
      inputValue: "",
      valid: true,
      results: ({ values }) => values,
    }),
  ],
};

const stringFilterMachine = Machine({
  id: "stringFilter",
  initial: "init",
  context: {
    error: undefined,
    values: [],
    inputValue: "",
    selected: [],
    currentResult: null,
    errorId: null,
    results: [],
    prevValue: "",
  },
  states: {
    init: {},
    reading: {
      on: {
        EDIT: {
          target: "editing",
        },
      },
    },
    editing: {
      entry: [
        assign({
          errorId: null,
          currentResult: null,
        }),
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
                MOUSELEAVE: "notHovering",
              },
            },
            notHovering: {
              on: {
                MOUSEENTER: "hovering",
              },
            },
          },
        },
      },
      on: {
        NEXT_RESULT: {
          actions: assign({
            currentResult: ({ currentResult, results }) => {
              if (currentResult === null) return 0;
              return Math.min(currentResult + 1, results.length - 1);
            },
            inputValue: ({ currentResult, results }) => {
              let result =
                results[Math.min(currentResult + 1, results.length - 1)];
              if (currentResult === null) {
                result = results[0];
              }
              return NONE.includes(result) ? "None" : result;
            },
          }),
        },
        PREVIOUS_RESULT: {
          actions: assign({
            currentResult: ({ currentResult }) => {
              if (currentResult === 0 || currentResult === null) return null;
              return currentResult - 1;
            },
            inputValue: ({ currentResult, prevValue, results }) => {
              if (currentResult === 0 || currentResult === null)
                return prevValue;
              const result = results[currentResult - 1];
              return NONE.includes(result) ? "None" : result;
            },
          }),
        },
        BLUR: {
          target: "reading",
        },
        COMMIT: [
          {
            target: "reading",
            cond: (ctx, event) => event.click && canCommit(ctx, event),
            ...commitActions,
          },
          {
            cond: canCommit,
            ...commitActions,
          },
          {
            actions: assign({
              error: (_, { value }) => ({
                name: "label",
                error: `${value === "" ? '""' : value} does not exist`,
              }),
              errorId: uuid(),
              valid: false,
            }),
          },
        ],
        CHANGE: {
          actions: [
            assign({
              inputValue: (_, { value }) => value,
              results: ({ values }, { value }) => matchValues(values, value),
              prevValue: ({ inputValue }) => inputValue,
            }),
          ],
        },
      },
    },
  },
  on: {
    CLEAR: {
      actions: [
        assign({
          selected: [],
        }),
      ],
    },
    REMOVE: {
      actions: [
        assign({
          selected: ({ selected }, { value }) => {
            return selected.filter((s) => s !== value);
          },
        }),
      ],
    },
    SET_VALUES: {
      target: "reading",
      actions: [
        assign({
          values: (_, { values }) => (values ? values : []),
          results: ({ inputValue }, { values }) =>
            matchValues(values, inputValue),
        }),
      ],
    },
    SET_SELECTED: {
      actions: assign({
        selected: (_, { selected }) => selected,
      }),
    },
  },
});

const StringInput = styled.input`
  width: 100%;
  background: ${({ theme }) => theme.backgroundDark};
  border: 1px solid #191c1f;
  box-shadow: 0 8px 15px 0 rgba(0, 0, 0, 0.43);
  border-radius: 2px;
  font-size: 14px;
  height: 2.5rem;
  font-weight: bold;
  padding: 0.5rem;
  margin-bottom: 0.5rem;

  &:focus {
    outline: none;
  }
`;

const Selected = styled.div`
  display: flex;
  justify-content: flex-start;
  margin: 0 -0.25rem;
  padding-bottom: 0.5rem;
  flex-wrap: wrap;
`;

const StringButton = styled.button`
    background: ${({ theme }) => theme.background};
    border: 2px solid #393C3F;
    background-color: #2D3034;
    border-radius: 11px;
    text-align: center
    vertical-align: middle;
    margin: 0.5rem 0.25rem 0;
    padding: 0 0.5rem;
    line-height: 20px;
    font-weight: bold;
    cursor: pointer;
    &:focus {
      outline: none;
    }
  `;

const StringFilterContainer = styled.div`
  position: relative;
  margin: 0.25rem 0;
`;

type Props = {
  valuesAtom: RecoilValueReadOnly<string[]>;
  selectedValuesAtom: RecoilState<string[]>;
  excludeAtom: RecoilState<boolean>;
  valueName: string;
  color?: string;
};

const StringFilter = React.memo(
  ({
    valuesAtom,
    selectedValuesAtom,
    excludeAtom,
    valueName,
    color,
  }: Props) => {
    const theme = useContext(ThemeContext);
    const values = useRecoilValue(valuesAtom);
    const [exclude, setExclude] = useRecoilState(excludeAtom);
    const [selectedValues, setSelectedValues] = useRecoilState(
      selectedValuesAtom
    );
    const [state, send] = useMachine(stringFilterMachine);
    const inputRef = useRef();

    useEffect(() => {
      const filtered = selectedValues.filter((c) => values.includes(c));
      filtered.length !== selectedValues.length && setSelectedValues(filtered);
    }, [values, selectedValues]);

    useEffect(() => {
      send({ type: "SET_VALUES", values: values });
    }, [values]);

    useOutsideClick(inputRef, () => send("BLUR"));
    const { inputValue, results, currentResult, selected } = state.context;

    useEffect(() => {
      if (JSON.stringify(selected) !== JSON.stringify(selectedValues)) {
        send({ type: "SET_SELECTED", selected: selectedValues });
      }
    }, [selectedValues]);

    useEffect(() => {
      if (
        (state.event.type === "COMMIT" && state.context.valid) ||
        state.event.type === "REMOVE" ||
        state.event.type === "CLEAR"
      ) {
        setSelectedValues(state.context.selected);
      }
    }, [state.event]);

    return (
      <>
        <StringFilterContainer>
          <div ref={inputRef}>
            <StringInput
              value={inputValue}
              placeholder={`+ filter by ${valueName}`}
              onFocus={() => state.matches("reading") && send("EDIT")}
              onBlur={() => {
                state.matches("editing.searchResults.notHovering") &&
                  send("BLUR");
              }}
              onChange={(e) => send({ type: "CHANGE", value: e.target.value })}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  send({ type: "COMMIT", value: e.target.value });
                }
              }}
              onKeyDown={(e) => {
                switch (e.key) {
                  case "Escape":
                    send("BLUR");
                    break;
                  case "ArrowDown":
                    send("NEXT_RESULT");
                    break;
                  case "ArrowUp":
                    send("PREVIOUS_RESULT");
                    break;
                }
              }}
            />
            {state.matches("editing") && (
              <SearchResults
                results={results
                  .filter((r) => !selected.includes(r))
                  .sort(NONE_SORT)}
                send={send}
                currentResult={currentResult}
                highlight={color}
                style={{
                  position: "absolute",
                  top: "0.25rem",
                  fontSize: 14,
                  maxHeight: 294,
                  overflowY: "scroll",
                }}
              />
            )}
          </div>
          {selected.length > 0 ? (
            exclude ? (
              <>
                <a
                  style={{ cursor: "pointer" }}
                  onClick={() => setExclude(!exclude)}
                >
                  show
                </a>
                <span style={{ padding: "0 0.25rem" }}>|</span>
                <a style={{ textDecoration: "underline" }}>excluding</a>
              </>
            ) : (
              <>
                <a style={{ textDecoration: "underline" }}>showing</a>
                <span style={{ padding: "0 0.25rem" }}>|</span>
                <a
                  style={{ cursor: "pointer" }}
                  onClick={() => setExclude(!exclude)}
                >
                  exclude
                </a>
              </>
            )
          ) : null}
          {selected.length ? (
            <Selected>
              {selected.map((s) => (
                <StringButton
                  key={s}
                  onClick={() => {
                    send({ type: "REMOVE", value: s });
                  }}
                >
                  {s === null ? <code style={{ color }}>None </code> : s + " "}
                  <a style={{ color: theme.fontDark }}>x</a>
                </StringButton>
              ))}
            </Selected>
          ) : null}
        </StringFilterContainer>
      </>
    );
  }
);

const NamedStringFilterContainer = styled.div`
  padding-bottom: 0.5rem;
  margin: 3px;
  font-weight: bold;
`;

const NamedStringFilterHeader = styled.div`
  display: flex;
  justify-content: space-between;
`;

type NamedProps = {
  valuesAtom: RecoilValueReadOnly<string[]>;
  selectedValuesAtom: RecoilState<string[]>;
  excludeAtom: RecoilState<boolean>;
  name: string;
  valueName: string;
  color: string;
};

export const NamedStringFilter = React.memo(
  React.forwardRef(({ name, ...stringFilterProps }: NamedProps, ref) => {
    const [values, setValues] = useRecoilState(
      stringFilterProps.selectedValuesAtom
    );

    return (
      <NamedStringFilterContainer ref={ref}>
        <NamedStringFilterHeader>
          {name}
          <div>
            {values.length > 0 ? (
              <a
                style={{ cursor: "pointer", textDecoration: "underline" }}
                onClick={() => setValues([])}
              >
                reset
              </a>
            ) : null}
          </div>
        </NamedStringFilterHeader>
        <StringFilterContainer>
          <StringFilter {...stringFilterProps} />
        </StringFilterContainer>
      </NamedStringFilterContainer>
    );
  })
);

export default StringFilter;
