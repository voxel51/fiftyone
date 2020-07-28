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

const borderColor = fontColor;

const ViewStageParameterDiv = animated(styled.div`
  box-sizing: border-box;
  border: 2px dashed ${borderColor};
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
  const { id, completed, parameter, stage, value, tail } = state.context;

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
    borderLeftWidth: 0,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    borderTopRightRadius: tail ? 3 : 0,
    borderBottomRightRadius: tail ? 3 : 0,
    opacity: 1,
    from: {
      opacity: 0,
    },
  });

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
