import React, { useCallback, useEffect, useRef } from "react";
import { animated } from "react-spring";
import styled from "styled-components";
import { useService } from "@xstate/react";
import cn from "classnames";

import SearchResults from "./SearchResults";

const ViewStageParameterDiv = animated(styled.div``);

const ViewStageParameterInput = animated(styled.input`
  background-color: var(--bg);
  border-color: var(--std-border-color);
  border-radius: var(--std-border-radius);
  border-style: solid;
  border-width: var(--std-border-width);
  box-sizing: border-box;
  display: inline-block;
  line-height: 1rem;
  margin: 0.25rem;
  padding: 0.5rem;
  color: var(--std-font-color);

  :focus {
    border-style: dashed;
    outline: none;
  }

  ::placeholder {
    color: var(--std-font-color);
  }
`);

export default ({ parameterRef }) => {
  const [state, send] = useService(parameterRef);
  const inputRef = useRef(null);
  const { id, completed, parameter, stage, value } = state.context;

  useEffect(() => {
    parameterRef.execute(state, {
      focusInput() {
        inputRef.current && inputRef.current.select();
      },
    });
  }, [state, parameterRef]);

  return (
    <ViewStageParameterDiv
      className={cn({
        editing: state.matches("editing"),
        completed,
      })}
      data-parameter-state={completed ? "completed" : "active"}
      key={id}
    >
      <ViewStageParameterInput
        placeholder={parameter}
        value={value}
        onBlur={() => send("BLUR")}
        onChange={(e) => send("CHANGE", { value: e.target.value })}
        onKeyPress={(e) => {
          if (e.key === "Enter") {
            send("COMMIT");
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            send("CANCEL");
          }
        }}
        ref={inputRef}
      />
    </ViewStageParameterDiv>
  );
};
