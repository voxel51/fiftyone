import React, { useCallback, useEffect, useRef } from "react";
import { animated } from "react-spring";
import styled from "styled-components";
import { useService } from "@xstate/react";
import cn from "classnames";

import { grey46 as fontColor } from "../../../shared/colors";
import SearchResults from "./SearchResults";

const ViewStageParameterInput = animated(styled.input`
  background-color: transparent;
  border: none;
  line-height: 1rem;
  margin: 0.5rem;
  width: auto;
  color: ${fontColor};
  max-width: 6.5rem;

  :focus {
    outline: none;
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
  );
};
