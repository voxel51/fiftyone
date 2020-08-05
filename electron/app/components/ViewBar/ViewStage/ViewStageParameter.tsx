import React, { useContext, useMemo, useEffect, useRef, useState } from "react";
import { animated, useSpring } from "react-spring";
import styled, { ThemeContext } from "styled-components";
import { useService, asEffect } from "@xstate/react";
import AutosizeInput from "react-input-autosize";

import SearchResults from "./SearchResults";

const ViewStageParameterDiv = animated(styled.div`
  box-sizing: border-box;
  border: 2px dashed ${({ theme }) => theme.brand};
  position: relative;
`);

const ViewStageParameterInput = animated(styled(AutosizeInput)`
  & > input {
    background-color: transparent;
    border: none;
    margin: 0.5rem;
    color: ${({ theme }) => theme.font};
    line-height: 1rem;
    border: none;
    font-weight: bold;
  }

  & > input:focus {
    border: none;
    outline: none;
  }

  & ::placeholder {
    color: ${({ theme }) => theme.font};
  }
`);

const ViewStageParameter = React.memo(({ parameterRef }) => {
  const theme = useContext(ThemeContext);
  const [state, send] = useService(parameterRef);
  const inputRef = useRef(null);

  const actionsMap = useMemo(
    () => ({
      focusInput: () => inputRef.current && inputRef.current.select(),
      blurInput: () => inputRef.current && inputRef.current.blur(),
    }),
    []
  );

  useEffect(() => {
    const listener = (state) => {
      state.actions.forEach((action) => {
        if (action.type in actionsMap) actionsMap[action.type]();
      });
    };
    parameterRef.onTransition(listener);

    return () => parameterRef.listeners.delete(listener);
  }, []);

  const { parameter, value } = state.context;

  const props = useSpring({
    backgroundColor: state.matches("reading.submitted")
      ? theme.brandTransparent
      : theme.brandMoreTransparent,
    borderStyle: state.matches("reading.submitted") ? "solid" : "dashed",
    borderRightWidth: 2,
    opacity: 1,
    from: {
      opacity: 0,
    },
  });

  const isEditing = state.matches("editing");

  return (
    <ViewStageParameterDiv style={props}>
      <ViewStageParameterInput
        placeholder={parameter}
        value={value}
        onFocus={() => !isEditing && send({ type: "EDIT" })}
        onBlur={() => isEditing && send({ type: "BLUR" })}
        onChange={(e) => {
          send({ type: "CHANGE", value: e.target.value });
        }}
        onKeyPress={(e) => {
          if (e.key === "Enter") {
            isEditing && send({ type: "COMMIT" });
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            send({ type: "CANCEL" });
          }
        }}
        ref={inputRef}
      />
    </ViewStageParameterDiv>
  );
});

export default ViewStageParameter;
