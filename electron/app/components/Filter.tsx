import React, { useContext, useEffect, useRef } from "react";
import styled, { ThemeContext } from "styled-components";
import { useRecoilState, useRecoilValue } from "recoil";
import { Machine, assign } from "xstate";
import { useMachine } from "@xstate/react";
import { Checkbox, FormControlLabel } from "@material-ui/core";
import uuid from "uuid-v4";

import * as selectors from "../recoil/selectors";
import { useOutsideClick } from "../utils/hooks";
import RangeSlider from "./RangeSlider";
import SearchResults from "./ViewBar/ViewStage/SearchResults";

const FilterDiv = styled.div`
  width: 100%;
  display: block;
  background: ${({ theme }) => theme.backgroundLight};
  padding: 0.5rem;
  font-weight: bold;
  font-size: 14px;
  margin: 3px 0;
  border-radius: 2px;
`;

const classFilterMachine = Machine({
  id: "classFilter",
  initial: "init",
  context: {
    error: undefined,
    classes: [],
    inputValue: "",
    selected: [],
    currentResult: null,
    errorId: null,
    results: [],
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
          currentResult: null,
          errorId: null,
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
        BLUR: {
          target: "reading",
        },
        COMMIT: [
          {
            actions: [
              assign({
                selected: ({ selected }, { value }) =>
                  [...new Set([...selected, value])].sort(),
                inputValue: "",
                valid: true,
              }),
            ],
            cond: ({ classes }, { value }) => {
              return classes.some((c) => c === value);
            },
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
              results: ({ classes }, { value }) =>
                classes.filter((c) =>
                  c.toLowerCase().includes(value.toLowerCase())
                ),
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
    SET_CLASSES: {
      target: "reading",
      actions: [
        assign({
          classes: (_, { classes }) => classes,
          results: ({ inputValue }, { classes }) =>
            classes.filter((c) =>
              c.toLowerCase().includes(inputValue.toLowerCase())
            ),
        }),
      ],
    },
    SET_SELECTED: {
      actions: assign({
        selected: (_, { selected }) => selected,
      }),
    },
    SET_INVERT: {
      actions: assign({
        invert: (_, { invert }) => invert,
      }),
    },
  },
});

const ClassInput = styled.input`
  width: 100%;
  background: ${({ theme }) => theme.backgroundDark};
  border: 1px solid #191c1f;
  box-shadow: 0 8px 15px 0 rgba(0, 0, 0, 0.43);
  border-radius: 2px;
  font-size: 14px;
  line-height: 1.2rem;
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
  flex-wrap: wrap;
`;

const ClassButton = styled.button`
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

const ClassFilterContainer = styled.div`
  margin: 0.5rem 0;
  position: relative;
`;

const ClassFilter = ({ name, atoms }) => {
  const theme = useContext(ThemeContext);
  const classes = useRecoilValue(selectors.labelClasses(name));
  const [selectedClasses, setSelectedClasses] = useRecoilState(
    atoms.includeLabels(name)
  );
  const [state, send] = useMachine(classFilterMachine);
  const ref = useRef();

  useEffect(() => {
    send({ type: "SET_CLASSES", classes });
    setSelectedClasses(selectedClasses.filter((c) => classes.includes(c)));
  }, [classes]);

  useOutsideClick(ref, () => send("BLUR"));
  const { inputValue, results, currentResult, selected } = state.context;

  useEffect(() => {
    JSON.stringify(selected) !== JSON.stringify(selectedClasses) &&
      send({ type: "SET_SELECTED", selected: selectedClasses });
  }, [selectedClasses]);

  useEffect(() => {
    ((state.event.type === "COMMIT" && state.context.valid) ||
      state.event.type === "REMOVE" ||
      state.event.type === "CLEAR") &&
      setSelectedClasses(state.context.selected);
  }, [state.event]);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        Labels{" "}
        {selected.length ? (
          <a
            style={{ cursor: "pointer", textDecoration: "underline" }}
            onClick={() => send({ type: "CLEAR" })}
          >
            clear {selected.length}
          </a>
        ) : null}
      </div>
      <ClassFilterContainer>
        <div ref={ref}>
          <ClassInput
            value={inputValue}
            placeholder={"+ add label"}
            onFocus={() => state.matches("reading") && send("EDIT")}
            onBlur={() =>
              state.matches("editing.searchResults.notHovering") && send("BLUR")
            }
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
              results={results.filter((r) => !selected.includes(r)).sort()}
              send={send}
              currentResult={currentResult}
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
        <Selected>
          {selected.map((s) => (
            <ClassButton
              onClick={() => {
                send({ type: "REMOVE", value: s });
              }}
            >
              {s + " "}
              <a style={{ color: theme.fontDark }}>x</a>
            </ClassButton>
          ))}
        </Selected>
      </ClassFilterContainer>
    </>
  );
};

const ConfidenceContainer = styled.div`
  background: ${({ theme }) => theme.backgroundDark};
  box-shadow: 0 8px 15px 0 rgba(0, 0, 0, 0.43);
  border: 1px solid #191c1f;
  border-radius: 2px;
  margin-top: 0.5rem;
  color: ${({ theme }) => theme.fontDark};
`;

const Filter = React.memo(({ style, entry, ...atoms }) => {
  const [includeNoConfidence, setIncludeNoConfidence] = useRecoilState(
    atoms.includeNoConfidence(entry.name)
  );
  const bounds = useRecoilValue(selectors.labelConfidenceBounds(entry.name));
  const [range, setRange] = useRecoilState(atoms.confidenceRange(entry.name));
  const theme = useContext(ThemeContext);

  const isDefaultRange = range[0] === 0 && range[1] === 1;
  const hasBounds = bounds.every((b) => b !== null);
  return (
    <div style={{ margin: 6 }}>
      <ClassFilter name={entry.name} atoms={atoms} />
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        Confidence{" "}
        {!isDefaultRange || !includeNoConfidence ? (
          <a
            style={{ cursor: "pointer", textDecoration: "underline" }}
            onClick={() => {
              setRange([0, 1]);
              setIncludeNoConfidence(true);
            }}
          >
            reset
          </a>
        ) : null}
      </div>
      <ConfidenceContainer>
        {hasBounds && (
          <RangeSlider
            atom={atoms.confidenceRange(entry.name)}
            min={bounds[0]}
            max={bounds[1]}
            step={0.01}
          />
        )}
        <FormControlLabel
          label={<div style={{ lineHeight: "20px" }}>Show no confidence</div>}
          control={
            <Checkbox
              checked={includeNoConfidence}
              onChange={() => setIncludeNoConfidence(!includeNoConfidence)}
              style={{
                padding: "0 5px",
                color: entry.selected ? entry.color : theme.fontDark,
              }}
            />
          }
        />
      </ConfidenceContainer>
    </div>
  );
});

export default Filter;
