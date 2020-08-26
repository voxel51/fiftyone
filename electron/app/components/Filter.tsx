import React, { useContext, useEffect, useState } from "react";
import styled, { ThemeContext } from "styled-components";
import { Slider as SliderUnstyled } from "@material-ui/core";
import { useSetRecoilState, useRecoilState, useRecoilValue } from "recoil";
import { Machine, assign } from "xstate";
import { useMachine } from "@xstate/react";
import { Checkbox, FormControlLabel } from "@material-ui/core";
import uuid from "uuid-v4";

import {
  filterLabelConfidenceRange,
  filterLabelIncludeNoConfidence,
} from "../recoil/atoms";
import { labelClasses } from "../recoil/selectors";
import SearchResults from "./ViewBar/ViewStage/SearchResults";

function valuetext(value: number[]) {
  return `${value[0]}-${value[1]}`;
}

const SearchResultsWrapper = styled.div`
  display: block;
  position: relative;
  top: -2rem;
`;

const SliderContainer = styled.div`
  font-weight: bold;
  display: flex;
`;

const Slider = styled(SliderUnstyled)`
  && {
    color: ${({ theme }) => theme.secondary};
  }
`;

const RangeSlider = ({ name, ...rest }) => {
  const setValue = useSetRecoilState(filterLabelConfidenceRange(name));
  const [localValue, setLocalValue] = useState([0, 1]);

  return (
    <SliderContainer>
      <Slider
        value={[...localValue]}
        onChange={(e, v) => setLocalValue([...v])}
        onChangeCommitted={(e, v) => {
          setLocalValue([...v]);
          setValue([...v]);
        }}
        valueLabelDisplay="auto"
        aria-labelledby="range-slider"
        getAriaValueText={valuetext}
        {...rest}
      />
    </SliderContainer>
  );
};

const FilterDiv = styled.div`
  width: 100%;
  display: block;
  background: ${({ theme }) => theme.backgroundLight};
  padding: 0.5rem;
  font-weight: bold;
  font-size: 1rem;
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
                selected: (_, { value }) => value,
              }),
            ],
            cond: ({ classes }, { value }) => classes.some((c) => c === value),
          },
          {
            actions: assign({
              error: (_, { value }) => ({
                name: "label",
                error: `${value === "" ? '""' : value} does not exist`,
              }),
              errorId: uuid(),
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
  },
});

const ClassInput = styled.input`
  width: 100%;
  background: ${({ theme }) => theme.backgroundDark};
  border: 1px ${({ theme }) => theme.backgroundDarkBorder};
  border-radius: 2px;
  font-size: 1rem;
  line-height: 1.2rem;
  font-weight: bold;
  padding: 0.5rem;

  &:focus {
    outline: none;
  }
`;

const ClassCloud = styled.div``;

const ClassButton = styled.button``;

const ClassFilterContainer = styled.div`
  margin-bottom: 0.5rem;
`;

const ClassFilter = ({ name }) => {
  const classes = useRecoilValue(labelClasses(name));
  const [state, send] = useMachine(classFilterMachine);

  useEffect(() => {
    send({ type: "SET_CLASSES", classes });
  }, [classes]);

  const { inputValue, results, currentResult } = state.context;
  console.log(state.toStrings());

  return (
    <ClassFilterContainer>
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
        <SearchResultsWrapper>
          <SearchResults
            results={results}
            send={send}
            currentResult={currentResult}
          />
        </SearchResultsWrapper>
      )}
    </ClassFilterContainer>
  );
};

const ConfidenceContainer = styled.div``;

const Filter = ({ entry }) => {
  const [includeNoConfidence, setIncludeNoConfidence] = useRecoilState(
    filterLabelIncludeNoConfidence(entry.name)
  );
  const theme = useContext(ThemeContext);

  return (
    <FilterDiv>
      <div>Labels</div>
      <ClassFilter name={entry.name} />
      <div>Confidence</div>
      <RangeSlider
        name={entry.name}
        title={"Confidence"}
        min={0}
        max={1}
        step={0.01}
      />
      <FormControlLabel
        label={<div>Show no confidence</div>}
        control={
          <Checkbox
            checked={includeNoConfidence}
            onChange={() => setIncludeNoConfidence(!includeNoConfidence)}
            style={{
              color: entry.selected
                ? entry.color
                : entry.disabled
                ? theme.fontDarkest
                : theme.fontDark,
            }}
          />
        }
      />
    </FilterDiv>
  );
};

export default Filter;
