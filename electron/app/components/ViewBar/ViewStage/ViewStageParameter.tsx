import React, { useContext, useMemo, useEffect, useRef, useState } from "react";
import { animated, useSpring } from "react-spring";
import styled, { ThemeContext } from "styled-components";
import { useService, asEffect } from "@xstate/react";
import AutosizeInput from "react-input-autosize";

import { PARSER } from "./viewStageParameterMachine";
import { useOutsideClick } from "../../../utils/hooks";

const ViewStageParameterDiv = animated(styled.div`
  box-sizing: border-box;
  border: 2px dashed ${({ theme }) => theme.brand};
  position: relative;
  z-index: 801;
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
  width: 100%;
  font-size: 1rem;
  font-weight: bold;
  line-height: 1rem;
  position: relative;
  margin: 0.5rem;
  overflow: visible;
`;

const ObjectEditorTextArea = animated(styled.textarea`
  position: relative;
  background-color: transparent;
  overflow: visible;
  font-weight: bold;
  line-height: 1rem;
  margin: -0.5rem;
  border: none;
  color: ${({ theme }) => theme.font};
  height: 100%;
  font-size: 1rem;
  white-space: pre-wrap;

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

const SubmitButton = animated(styled.button`
  box-sizing: border-box;
  border: 2px dashed ${({ theme }) => theme.brand};
  color: ${({ theme }) => theme.font};
  background-color: hsla(27, 95%, 49%, 0.4);
  border-radius: 3px;
  position: relative;
  margin: 0.5rem;
  line-height: 1rem;
  cursor: pointer;
  font-weight: bold;
  position: absolute;
  bottom: 0.5rem;
  right: 0.5rem;

  :focus {
    outline: none;
  }
`);

const Submit = ({ send }) => {
  const props = useSpring({
    opacity: 1,
    from: {
      opacity: 0,
    },
  });
  return (
    <SubmitButton style={props} onClick={() => send("COMMIT")}>
      Submit
    </SubmitButton>
  );
};

const convert = (value) => {
  const isObject = PARSER.dict.validate(value);
  if (isObject) return "{ ... }";
  return value;
};

const ObjectEditor = ({ parameterRef, inputRef }) => {
  const [state, send] = useService(parameterRef);
  const theme = useContext(ThemeContext);
  const containerRef = useRef(null);

  const { value, type } = state.context;

  const isEditing = state.matches("editing");
  const props = useSpring({
    width: state.matches("editing") ? 400 : 0,
  });

  useOutsideClick(containerRef, (e) => {
    e.stopPropagation();
    send("BLUR");
  });

  return (
    <ObjectEditorContainer
      onClick={() => state.matches("reading") && send("EDIT")}
      ref={containerRef}
    >
      {state.matches("reading") ? (
        convert(value)
      ) : (
        <>
          <ObjectEditorTextArea
            key="textarea"
            autoFocus={state.matches("editing")}
            style={props}
            onChange={(e) => {
              send({
                type: "CHANGE",
                value: e.target.value.replace(/&#13/g, "\n"),
              });
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                send({ type: "CANCEL" });
              }
            }}
            value={value}
            ref={inputRef}
          ></ObjectEditorTextArea>
          <Submit key="submit" send={send} />
        </>
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
    backgroundColor:
      state.matches("editing") && hasObjectType
        ? theme.backgroundDark
        : state.matches("reading.submitted")
        ? theme.brandTransparent
        : theme.brandMoreTransparent,
    borderStyle: state.matches("reading.submitted") ? "solid" : "dashed",
    borderRightWidth: tail ? 2 : 0,
    height: hasObjectType && state.matches("editing") ? 200 : 36,
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
