import React, { useContext, useMemo, useEffect, useRef, useState } from "react";
import { animated, useSpring } from "react-spring";
import styled, { ThemeContext } from "styled-components";
import { useService, asEffect } from "@xstate/react";
import AutosizeInput from "react-input-autosize";

import { PARSER } from "./viewStageParameterMachine";

const ViewStageParameterDiv = animated(styled.div`
  box-sizing: border-box;
  border: 2px dashed ${({ theme }) => theme.brand};
  position: relative;
  z-index: 1000;
  overflow: hidden;
`);

const ViewStageParameterInput = animated(styled(AutosizeInput)`
  & > input {
    background-color: transparent;
    border: none;
    margin: 0.5rem;
    color: ${({ theme }) => theme.font};
    line-height: 1rem;
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

const ObjectEditorContainer = styled.div`
  height: 100%;
  font-size: 1rem;
  font-weight: bold;
  line-height: 1rem;
  position: relative;
`;

const ObjectEditorTextArea = animated(styled.textarea`
  position: relative;
  background-color: transparent;
  font-weight: bold;
  line-height: 1rem;
  border: none;
  color: ${({ theme }) => theme.font};
  width: 100%;
  height: 100%;
  font-size: 1rem;

  &::-webkit-scrollbar {
    width: 0px;
    background: transparent;
    display: none;
  }
  &::-webkit-scrollbar-thumb {
    width: 0px;
    display: none;
  }

  &:focus {
    border: none;
    outline: none;
  }
`);

const convert = (value) => {
  const isObject = PARSER.dict.validate(value);
  if (isObject) return "{ ... }";
  return value;
};

const ObjectEditor = ({ parameterRef, inputRef }) => {
  const [state, send] = useService(parameterRef);
  const theme = useContext(ThemeContext);
  const textAreaRef = useRef(null);

  const { value, type } = state.context;
  const [props, set] = useSpring(() => ({
    width: 0,
    height: 0,
  }));

  const isEditing = state.matches("editing");

  useEffect(() => {
    set({
      width: isEditing ? 100 : 0,
      height: isEditing ? 100 : 0,
    });
  }, [isEditing]);

  return (
    <ObjectEditorContainer
      onClick={() => state.matches("reading") && send("EDIT")}
    >
      {state.matches("reading") ? (
        convert(value)
      ) : (
        <ObjectEditorTextArea
          style={props}
          onChange={(e) => {
            send({ type: "CHANGE", value: e.target.value });
          }}
          onBlur={() => alert("ee") && send({ type: "BLUR" })}
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
          value={value}
          ref={inputRef}
        ></ObjectEditorTextArea>
      )}
    </ObjectEditorContainer>
  );
};

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

  const { parameter, value, type, tail } = state.context;
  const hasObjectType = typeof type === "string" && type.includes("dict");

  const props = useSpring({
    backgroundColor: state.matches("reading.submitted")
      ? theme.brandTransparent
      : theme.brandMoreTransparent,
    borderStyle: state.matches("reading.submitted") ? "solid" : "dashed",
    borderRightWidth: tail ? 2 : 0,
    y: hasObjectType && state.matches("editing") ? -50 : 0,
    opacity: 1,
    from: {
      opacity: 0,
    },
  });

  const isEditing = state.matches("editing");

  return (
    <ViewStageParameterDiv style={props}>
      {hasObjectType ? (
        <ObjectEditor parameterRef={parameterRef} inputRef={inputRef} />
      ) : (
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
      )}
    </ViewStageParameterDiv>
  );
});

export default ViewStageParameter;
