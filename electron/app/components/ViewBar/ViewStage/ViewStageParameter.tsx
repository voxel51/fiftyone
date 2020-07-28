import React, { useCallback, useEffect, useRef } from "react";
import { animated, useSpring } from "react-spring";
import styled from "styled-components";
import { useService } from "@xstate/react";
import AutosizeInput from "react-input-autosize";

import {
  grey46 as fontColor,
  grey46a30 as backgroundColorIncomplete,
  white100 as backgroundColorComplete,
} from "../../../shared/colors";
import SearchResults from "./SearchResults";

const ViewStageParameterDiv = animated(styled.div`
  box-sizing: border-box;
  border: 2px dashed #6c757d;
  border-radius: 3px;
  display: inline-block;
  position: relative;
`);

const ViewStageParameterInput = animated(styled(AutosizeInput)`
  & > input {
    background-color: transparent;
    border: none;
    margin: 0.5rem;
    color: ${fontColor};
    line-height: 1rem;
    border: none;
  }

  & > input:focus {
    boder: none;
    outline: none;
  }
`);

export default React.memo(({ parameterRef }) => {
  const [state, send] = useService(parameterRef);
  const inputRef = useRef(null);
  const { id, completed, parameter, stage, value } = state.context;

  useEffect(() => {
    parameterRef.execute(state, {
      focusInput() {
        inputRef.current && inputRef.current.select();
      },

      blurInput() {
        inputRef.current && inputRef.current.blur();
      },
    });
  }, [state, parameterRef]);

  const props = useSpring({
    backgroundColor: state.matches("reading.submitted")
      ? backgroundColorComplete
      : backgroundColorIncomplete,
    borderStyle: state.matches("reading.submitted") ? "solid" : "dashed",
    borderLeft: "none",
    borderTopLeftRadius: state.matches("reading.submitted") ? 0 : 3,
    borderBottomLeftRadius: state.matches("reading.submitted") ? 0 : 3,
    opacity: 1,
    from: {
      opacity: 0,
    },
  });

  console.log(state.toStrings());

  return (
    <ViewStageParameterDiv style={props}>
      <ViewStageParameterInput
        placeholder={parameter}
        value={value}
        onFocus={() => send("EDIT")}
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
});
