import React, { useContext, useMemo, useEffect, useRef, useState } from "react";
import { animated, useSpring } from "react-spring";
import styled, { ThemeContext } from "styled-components";
import { useService } from "@xstate/react";
import AutosizeInput from "react-input-autosize";

import { PARSER, toTypeAnnotation } from "./viewStageParameterMachine";
import { useFollow, useOutsideClick } from "../../../utils/hooks";
import ErrorMessage from "./ErrorMessage";

const ViewStageParameterContainer = styled.div`
  display: flex;
`;

const ViewStageParameterDiv = animated(styled.div`
  box-sizing: border-box;
  border: 1px solid ${({ theme }) => theme.brand};
  position: relative;
  display: flex;
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

const ObjectEditorContainer = animated(styled.div`
  font-weight: bold;
  position: fixed;
  line-height: 1rem;
  font-size: 14px;
  margin: 0.5rem;
  overflow: visible;
  display: flex;
  border: 1px solid pink;
  border-style: solid;
  z-index: 800;
`);

const ObjectEditorTextArea = animated(styled.textarea`
  background-color: transparent;
  overflow: visible;
  line-height: 1rem;
  border: none;
  color: ${({ theme }) => theme.font};
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

const SubmitButton = animated(styled.button`
  box-sizing: border-box;
  border: 1px solid ${({ theme }) => theme.brand};
  color: ${({ theme }) => theme.font};
  background-color: ${({ theme }) => theme.brandTransparent};
  border-radius: 3px;
  position: relative;
  line-height: 1rem;
  cursor: pointer;
  font-weight: bold;
  position: absolute;
  bottom: 1rem;
  right: 0;

  :focus {
    outline: none;
  }
`);

const Submit = React.memo(({ send }) => {
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
});

const convert = (value, placeholder) => {
  const isObject = PARSER.dict.validate(value);
  if (isObject) return "{ ... }";
  else if (value === "") {
    return placeholder;
  }
  return value;
};

const makePlaceholder = (parameter, type, defaultValue) =>
  [
    defaultValue ? [parameter, defaultValue].join("=") : parameter,
    toTypeAnnotation(type),
  ].join(": ");

const ObjectEditor = ({ barRef, parameterRef, followRef, inputRef }) => {
  const [state, send] = useService(parameterRef);
  const theme = useContext(ThemeContext);
  const containerRef = useRef(null);

  const { parameter, defaultValue, value, type } = state.context;

  const [cprops, cset] = useSpring(() => ({
    left: 0,
    top: 0,
    backgroundColor: state.matches("editing")
      ? theme.backgroundDark
      : state.matches("reading.submitted")
      ? theme.backgroundLight
      : theme.background,
    borderColor: state.matches("editing")
      ? theme.secondary
      : active
      ? theme.brand
      : theme.fontDarkest,
    width: state.matches("editing") ? 400 : 0,
    config: {
      duration: 1,
    },
  }));

  const props = useSpring({
    width: state.matches("editing") ? 400 : 0,
  });

  barRef && followRef && useFollow(barRef, followRef, cset);

  useOutsideClick(containerRef, (e) => {
    e.stopPropagation();
    send("BLUR");
  });

  useEffect(() => {
    followRef.current &&
      cset({
        left: followRef.current.getBoundingClientRect().x,
        top: followRef.current.getBoundingClientRect().y,
        backgroundColor: state.matches("editing")
          ? theme.backgroundDark
          : state.matches("reading.submitted")
          ? theme.backgroundLight
          : theme.background,
        borderColor: state.matches("editing")
          ? theme.secondary
          : active
          ? theme.brand
          : theme.fontDarkest,
        config: {
          duration: 1,
        },
      });
  }, [followRef.current]);

  return (
    <>
      <animated.div style={{ height: "100%", ...props }} />
      <ObjectEditorContainer
        style={cprops}
        onClick={() => state.matches("reading") && send("EDIT")}
        ref={containerRef}
      >
        {state.matches("reading") ? (
          convert(value, makePlaceholder(parameter, type, defaultValue))
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
                  send("COMMIT");
                }
              }}
              value={value}
              ref={inputRef}
            ></ObjectEditorTextArea>
            <Submit key="submit" send={send} />
          </>
        )}
        <ErrorMessage
          key="error"
          serviceRef={parameterRef}
          style={{ marginTop: "12rem", marginLeft: -10 }}
        />
      </ObjectEditorContainer>
    </>
  );
};

const ViewStageParameter = React.memo(({ parameterRef, barRef }) => {
  const theme = useContext(ThemeContext);
  const [state, send] = useService(parameterRef);
  const inputRef = useRef();
  const [containerRef, setContainerRef] = useState({});

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

  const { defaultValue, parameter, tail, type, value, active } = state.context;
  const hasObjectType = typeof type === "string" && type.includes("dict");

  const props = useSpring({
    backgroundColor:
      state.matches("editing") && hasObjectType
        ? theme.backgroundDark
        : state.matches("reading.submitted")
        ? theme.backgroundLight
        : theme.background,
    borderStyle: "solid",
    borderColor: state.matches("editing")
      ? theme.secondary
      : active
      ? theme.brand
      : theme.fontDarkest,
    borderRightWidth: tail && !hasObjectType ? 1 : 0,
    height: hasObjectType && state.matches("editing") ? 200 : 34,
    borderWidth: hasObjectType ? 0 : 1,
    opacity: 1,
    from: {
      opacity: 0,
    },
  });

  const isEditing = state.matches("editing");

  return (
    <ViewStageParameterContainer
      ref={(node) =>
        node &&
        node !== containerRef.current &&
        setContainerRef({ current: node })
      }
    >
      {hasObjectType ? (
        <ObjectEditor
          parameterRef={parameterRef}
          barRef={barRef}
          followRef={containerRef}
          inputRef={inputRef}
        />
      ) : (
        <ViewStageParameterDiv style={props}>
          <ViewStageParameterInput
            placeholder={makePlaceholder(parameter, type, defaultValue)}
            autoFocus={state.matches("editing")}
            value={value}
            onFocus={() => !isEditing && send({ type: "EDIT" })}
            onBlur={() => isEditing && send({ type: "COMMIT" })}
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
                send({ type: "COMMIT" });
              }
            }}
            ref={inputRef}
          />
          {containerRef.current && (
            <ErrorMessage
              key="error"
              serviceRef={parameterRef}
              barRef={barRef}
              followRef={containerRef}
            />
          )}
        </ViewStageParameterDiv>
      )}
    </ViewStageParameterContainer>
  );
});

export default ViewStageParameter;
