import React, { useCallback, useEffect, useRef } from "react";
import styled from "styled-components";
import { useService } from "@xstate/react";
import cn from "classnames";

import SearchResults from "./SearchResults";

const ViewStageParameterDiv = styled.div``;

const ViewStageParameterInput = styled.input``;

export default ({ parameterRef }) => {
  console.log(parameterRef);
  const [state, send] = useService(parameterRef);
  const inputRef = useRef(null);
  console.log(state);
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
        onBlur={(_) => send("BLUR")}
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
        ref={parameterRef}
      />
    </ViewStageParameterDiv>
  );
};
