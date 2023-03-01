import { ArrowDropDown, ArrowDropUp } from "@mui/icons-material";
import { animated, useSpring } from "@react-spring/web";
import { useService } from "@xstate/react";
import React, { useContext, useEffect, useRef, useState } from "react";
import AutosizeInput from "react-input-autosize";
import styled, { ThemeContext } from "styled-components";

import { useTheme } from "@fiftyone/components";
import {
  theme as themeState,
  useEventHandler,
  useObserve,
  useOutsideClick,
} from "@fiftyone/state";
import { useRecoilValue } from "recoil";
import { BestMatchDiv } from "./BestMatch";
import ErrorMessage from "./ErrorMessage";
import SearchResults from "./SearchResults";
import { PARSER } from "./viewStageParameterMachine";

const ViewStageParameterContainer = styled.div`
  display: flex;
  overflow: visible;
  z-index: 800;
`;

const ViewStageParameterDiv = animated(styled.div`
  box-sizing: border-box;
  border: 1px solid ${({ theme }) => theme.primary.plainColor};
  display: flex;
  overflow: visible;
  height: 100%;
`);

const ViewStageParameterInput = animated(styled(AutosizeInput)`
  & > input {
    background-color: transparent;
    border: none;
    padding: 0.5rem 0 0.5rem 0.5rem;
    color: ${({ theme }) => theme.text.primary};
    height: 1rem;
    font-weight: bold;
  }

  & > input:focus {
    border: none;
    outline: none;
  }

  & ::placeholder {
    color: ${({ theme }) => theme.text.primary};
  }
`);

const ObjectEditorContainer = animated(styled.div`
  font-weight: bold;
  position: fixed;
  line-height: 1rem;
  font-size: 14px;
  margin-left: -1px;
  overflow: visible;
  display: flex;
  border: 1px solid pink;
  border-style: solid;
  z-index: 800;
  will-change: transform;
  min-width: 2rem;
`);

const ObjectEditorTextArea = animated(styled.textarea`
  background-color: transparent;
  overflow: visible;
  line-height: 1rem;
  border: none;
  color: ${({ theme }) => theme.text.primary};
  height: 100%;
  font-size: 14px;
  will-change: tranform;
  resize: none;

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
  border: 1px solid ${({ theme }) => theme.primary.plainColor};
  color: ${({ theme }) => theme.text.primary};
  background-color: ${({ theme }) => theme.background.level1};
  border-radius: 3px;
  position: relative;
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
  if (isObject) return "  . . .  ";
  else if (value === "") {
    return placeholder;
  }
  return value;
};

const makePlaceholder = ({ placeholder, parameter }) => {
  if (placeholder !== undefined) return placeholder;
  return parameter;
};

let request;

const ObjectEditor = ({
  barRef,
  parameterRef,
  followRef,
  inputRef,
  stageRef,
  onClose,
  hasExpansion,
}) => {
  const [state, send] = useService(parameterRef);
  const [stageState] = useService(stageRef);
  const theme = useContext(ThemeContext);
  const containerRef = useRef(null);
  const themeMode = useRecoilValue(themeState);

  const { active, value } = state.context;

  const [containerProps, containerSet] = useSpring(() => ({
    height: state.matches("editing") ? 200 : 36,
    position: state.matches("editing") ? "fixed" : "relative",
    backgroundColor: state.matches("editing")
      ? theme.background.level2
      : state.matches("reading.submitted")
      ? theme.background.level1
      : theme.background.body,
    borderColor:
      active && stageState.matches("focusedViewBar.yes")
        ? theme.primary.plainColor
        : theme.text.tertiary,
    opacity: 1,
    from: {
      opacity: 0,
    },
  }));

  const props = useSpring({
    width: state.matches("editing") ? 400 : 0,
  });

  useOutsideClick(containerRef, (e) => {
    send("BLUR");
    onClose();
  });

  useEffect(() => {
    containerSet({
      position: state?.matches("editing") ? "fixed" : "relative",
      backgroundColor: state?.matches("editing")
        ? theme.background.level2
        : state?.matches("reading.submitted")
        ? theme.background.level1
        : theme.background.body,
      borderColor:
        active && stageState.matches("focusedViewBar.yes")
          ? theme.primary.plainColor
          : theme.text.tertiary,
      height: state?.matches("editing") ? 200 : 36,
      opacity: 1,
    });
  }, [
    state?.matches("editing"),
    active,
    stageState.matches("focusedViewBar.yes"),
    themeMode,
    containerSet,
    stageState,
    state,
  ]);

  const attach = () => {
    request && window.cancelAnimationFrame(request);
    request = window.requestAnimationFrame(() => {
      if (!containerRef.current) return;
      const { x, y } = state.matches("editing")
        ? followRef.current.getBoundingClientRect()
        : { x: 0, y: 0 };
      // containerRef.current.style is undefined initially
      containerRef.current = containerRef.current || followRef.current;
      containerRef.current.style.top = state.matches("editing")
        ? `${y}px`
        : "unset";
      containerRef.current.style.left = state.matches("editing")
        ? `${x}px`
        : "unset";
      // barRef.current is oten undefined. Should it be set somehwere?
      const { x: barX, width: barWidth } = barRef.current
        ? barRef.current.getBoundingClientRect()
        : { x: "auto", width: "auto" };
      const barRight = barX + barWidth;
      containerRef.current.style.width = state.matches("editing")
        ? `${Math.min(barRight - x, 400)}px`
        : "auto";
    });
  };

  useEventHandler(barRef.current ? barRef.current : null, "scroll", attach);
  useEventHandler(window, "scroll", attach);
  useObserve(containerRef ? containerRef.current : null, attach);

  return (
    <>
      {state.matches("editing") && (
        <animated.div style={{ height: "100%", ...props }} />
      )}
      <ObjectEditorContainer
        style={containerProps}
        onClick={() => state.matches("reading") && send("EDIT")}
        ref={containerRef}
      >
        {state.matches("reading") ? (
          <div style={{ padding: "0.5em", whiteSpace: "nowrap" }}>
            {convert(value, makePlaceholder(state.context))}
          </div>
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
                if (["Escape", "Tab"].includes(e.key)) {
                  send("COMMIT");
                  onClose();
                }
              }}
              value={value}
              ref={inputRef}
            ></ObjectEditorTextArea>
            {hasExpansion && (
              <ArrowDropUp
                style={{
                  cursor: "pointer",
                  color: theme.text.primary,
                  marginTop: "0.2em",
                  position: "absolute",
                  right: "0.2rem",
                }}
                onClick={onClose}
              />
            )}
            <Submit key="submit" send={send} />
          </>
        )}
        <ErrorMessage
          key="error"
          serviceRef={parameterRef}
          style={{ marginTop: "12.5rem", marginLeft: 0 }}
        />
      </ObjectEditorContainer>
    </>
  );
};
function isJsonString(str) {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}
const ViewStageParameter = React.memo(({ parameterRef, barRef, stageRef }) => {
  const theme = useTheme();
  const [state, send] = useService(parameterRef);
  const [stageState] = useService(stageRef);
  const inputRef = useRef();
  const [containerRef, setContainerRef] = useState({});
  const [expanded, setExpanded] = useState(false);

  const { type, value, active, currentResult, results, bestMatch } =
    state.context;
  const hasObjectType = type
    .split("|")
    .some((t) => ["dict", "json"].includes(t));

  const hasExpansion = type === "dict|str";
  const isObjectEditor = hasObjectType && (!hasExpansion || expanded);
  let isObject = false;
  try {
    // fails when value is just a string field name
    const parsedValue = isJsonString(value) ? JSON.parse(value) : value;
    isObject = !Array.isArray(parsedValue) && typeof parsedValue === "object";
  } catch {
    console.log("ViewStageParameter Invalid JSON. Cannot parse value", value);
  }
  useEffect(() => {
    if (!hasExpansion || expanded) return;
    isObject && setExpanded(true);
  }, [value]);

  const props = useSpring({
    backgroundColor: state.matches("editing")
      ? theme.background.level2
      : state.matches("reading.submitted")
      ? theme.background.level1
      : theme.background.body,
    borderStyle: "solid",
    borderColor:
      active && stageState.matches("focusedViewBar.yes")
        ? theme.primary.plainColor
        : theme.text.tertiary,
    height: isObjectEditor && state.matches("editing") ? 200 : 36,
    borderWidth: isObjectEditor ? 0 : 1,
    borderRightWidth: 0,
    opacity: 1,
    from: {
      opacity: 0,
    },
  });

  const isEditing = state.matches("editing");
  useEffect(() => {
    isEditing && inputRef.current && inputRef.current.focus();
    !isEditing && inputRef.current && inputRef.current.blur();
  }, [isEditing, inputRef.current]);

  return (
    <>
      <ViewStageParameterContainer
        ref={(node) =>
          node &&
          node !== containerRef.current &&
          setContainerRef({ current: node })
        }
      >
        {isObjectEditor ? (
          <ObjectEditor
            parameterRef={parameterRef}
            barRef={barRef}
            followRef={containerRef}
            inputRef={inputRef}
            stageRef={stageRef}
            onClose={() => {
              if (!hasExpansion) return;
              setExpanded(false);
              isObject && send("BLUR");
            }}
            hasExpansion={hasExpansion}
          />
        ) : (
          <ViewStageParameterDiv style={props}>
            <ViewStageParameterInput
              placeholder={makePlaceholder(state.context)}
              autoFocus={state.matches("editing")}
              value={
                isObject
                  ? ". . ."
                  : state.matches("reading") && value.length > 24
                  ? value.slice(0, 25) + "..."
                  : value
              }
              onFocus={() => !isEditing && send({ type: "EDIT" })}
              onBlur={() =>
                state.matches("editing.notHovering") && send({ type: "COMMIT" })
              }
              onChange={(e) => {
                send({ type: "CHANGE", value: e.target.value });
              }}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  isEditing && send({ type: "COMMIT" });
                }
              }}
              onKeyDown={(e) => {
                switch (e.key) {
                  case "Tab":
                    send("COMMIT");
                    break;
                  case "Escape":
                    send("COMMIT");
                    break;
                  case "ArrowDown":
                    send("NEXT_RESULT");
                    break;
                  case "ArrowUp":
                    send("PREVIOUS_RESULT");
                    break;
                  case "ArrowRight":
                    e.target.selectionStart === e.target.value.length &&
                      bestMatch.value &&
                      send({ type: "CHANGE", value: bestMatch.value });
                    break;
                }
              }}
              ref={inputRef}
            />
            <BestMatchDiv>
              {bestMatch ? bestMatch.placeholder : ""}
            </BestMatchDiv>
            {hasExpansion && isEditing && (
              <ArrowDropDown
                style={{
                  cursor: "pointer",
                  color: theme.text.primary,
                  marginTop: "0.2em",
                }}
                onMouseEnter={() => send("MOUSEENTER")}
                onMouseLeave={() => send("MOUSELEAVE")}
                onClick={() => setExpanded(true)}
              />
            )}
          </ViewStageParameterDiv>
        )}
      </ViewStageParameterContainer>
      {state.matches("editing") && barRef.current && containerRef.current && (
        <SearchResults
          results={results}
          send={send}
          currentResult={currentResult}
          bestMatch={bestMatch.value}
          followRef={containerRef}
          barRef={barRef}
        />
      )}
      {!hasObjectType && containerRef.current && (
        <ErrorMessage
          key="error"
          serviceRef={parameterRef}
          barRef={barRef}
          followRef={containerRef}
        />
      )}
    </>
  );
});

export default ViewStageParameter;
