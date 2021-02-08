import React, { useContext, useEffect, useRef } from "react";
import { RecoilState, useRecoilState, useRecoilValue } from "recoil";
import { Checkbox, FormControlLabel } from "@material-ui/core";
import styled, { ThemeContext } from "styled-components";
import { useMachine } from "@xstate/react";

import SearchResults from "../ViewBar/ViewStage/SearchResults";
import { useOutsideClick } from "../../utils/hooks";

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
  valuesAtom: RecoilState<string[]>;
  selectedValuesAtom: RecoilState<string[]>;
  valueName: string;
};

const StringFilter = React.memo(
  ({ valuesAtom, selectedValuesAtom, valueName }: Props) => {
    const theme = useContext(ThemeContext);
    const values = useRecoilValue(valuesAtom);
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
      send({ type: "SET_VALUES", values });
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
              placeholder={`+ add ${valueName}`}
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
          {selected.length ? (
            <Selected>
              {selected.map((s) => (
                <StringButton
                  key={s}
                  onClick={() => {
                    send({ type: "REMOVE", value: s });
                  }}
                >
                  {s + " "}
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

const CheckboxContainer = styled.div`
  background: ${({ theme }) => theme.backgroundDark};
  box-shadow: 0 8px 15px 0 rgba(0, 0, 0, 0.43);
  border: 1px solid #191c1f;
  border-radius: 2px;
  color: ${({ theme }) => theme.fontDark};
  margin-top: 0.25rem;
`;

type NamedProps = {
  valuesAtom: RecoilState<string[]>;
  selectedValuesAtom: RecoilState<string[]>;
  includeNoneAtom: RecoilState<boolean>;
  name: string;
  valueName: string;
  color: string;
};

export const NamedStringFilter = React.memo(
  React.forwardRef(
    (
      { color, name, includeNoneAtom, ...stringFilterProps }: NamedProps,
      ref
    ) => {
      const [includeNone, setIncludeNone] = useRecoilState(includeNoneAtom);
      const [values, setValues] = useRecoilState(
        stringFilterProps.selectedValuesAtom
      );

      return (
        <NamedStringFilterContainer ref={ref}>
          <NamedStringFilterHeader>
            {name}
            {values.length || !includeNone ? (
              <a
                style={{ cursor: "pointer", textDecoration: "underline" }}
                onClick={() => {
                  setValues([]);
                  setIncludeNone(true);
                }}
              >
                reset
              </a>
            ) : null}
          </NamedStringFilterHeader>
          <StringFilterContainer>
            <StringFilter {...stringFilterProps} />
            <CheckboxContainer>
              <FormControlLabel
                label={
                  <div style={{ lineHeight: "20px", fontSize: 14 }}>
                    Filter no {stringFilterProps.valueName}
                  </div>
                }
                control={
                  <Checkbox
                    checked={!includeNone}
                    onChange={() => setIncludeNone(!includeNone)}
                    style={{
                      padding: "0 5px",
                      color,
                    }}
                  />
                }
              />
            </CheckboxContainer>
          </StringFilterContainer>
        </NamedStringFilterContainer>
      );
    }
  )
);

export default StringFilter;
