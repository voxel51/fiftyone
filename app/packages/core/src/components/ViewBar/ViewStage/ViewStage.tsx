import React, { useContext, useEffect, useRef, useState } from "react";
import styled, { ThemeContext } from "styled-components";
import { animated, useSpring, config } from "@react-spring/web";
import { useService } from "@xstate/react";
import AuosizeInput from "react-input-autosize";
import { Add, KeyboardReturn as Arrow, Close, Help } from "@mui/icons-material";

import { BestMatchDiv } from "./BestMatch";
import ErrorMessage from "./ErrorMessage";
import { ExternalLink } from "../../../utils/generic";
import SearchResults from "./SearchResults";
import ViewStageParameter from "./ViewStageParameter";
import { getMatch } from "./utils";
import { useTheme } from "@fiftyone/components";

const ViewStageContainer = animated(styled.div`
  margin: 0.5rem;
  display: flex;
  position: relative;
`);

const ViewStageDiv = animated(styled.div`
  box-sizing: border-box;
  border: 1px solid ${({ theme }) => theme.primary.plainColor};
  border-top-left-radius: 3px;
  border-bottom-left-radius: 3px;
  border-right-width: 0;
  position: relative;
  display: flex;
`);

const ViewStageInput = styled(AuosizeInput)`
  & input {
    background-color: transparent;
    border: none;
    padding: 0.5rem;
    color: ${({ theme }) => theme.text.primary};
    height: 1rem;
    border: none;
    font-weight: bold;
  }

  & input:focus {
    border: none;
    outline: none;
    font-weight: bold;
    padding-right: 0;
  }

  & ::placeholder {
    color: ${({ theme }) => theme.text.secondary};
    font-weight: bold;
  }
`;

const ViewStageButtonContainer = animated(styled.div`
  box-sizing: border-box;
  border: 1px dashed ${({ theme }) => theme.text.secondary};
  color: ${({ theme }) => theme.text.tertiary};
  border-radius: 3px;
  position: relative;
  margin: 0.5rem;
  cursor: pointer;
  font-weight: bold;

  padding: 0 0.25rem;

  :focus {
    outline: none;
  }
`);

const ViewStageButton = styled.div`
  width: 14px;
  height: 32px;
  display: block;
  position: relative;
  overflow: hidden;
`;

export const AddViewStage = React.memo(({ send, index, active }) => {
  const theme = useTheme();
  const [hovering, setHovering] = useState(false);
  const [props, set] = useSpring(() => ({
    background: theme.background,
    color: active ? theme.text.primary : theme.text.tertiary,
    borderColor: active ? theme.primary.plainColor : theme.text.tertiary,
    top: active ? -3 : 0,
    opacity: 1,
    from: {
      opacity: 0,
    },
    config: config.stiff,
  }));

  useEffect(() => {
    set({
      top: active ? -3 : 0,
      color: active ? theme.text.primary : theme.text.tertiary,
      borderColor: active ? theme.primary.plainColor : theme.text.tertiary,
    });
    active ? setEnterProps() : setLeaveProps();
  }, [active]);

  const [addProps, setAdd] = useSpring(() => ({
    marginTop: active ? 0 : 31,
  }));

  const [arrowProps, setArrow] = useSpring(() => ({
    marginTop: active ? -31 : 0,
  }));

  const setEnterProps = () => {
    set({ background: theme.background.body });
    setAdd({ marginTop: 0 });
    setArrow({ marginTop: -31 });
  };

  const setLeaveProps = () => {
    set({ background: theme.background.level2 });
    setAdd({ marginTop: 31 });
    setArrow({ marginTop: 0 });
  };

  useEffect(() => {
    (active || hovering) && setEnterProps();
    !active && !hovering && setLeaveProps();
  }, [active, hovering]);

  return (
    <ViewStageButtonContainer
      style={props}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={() => send({ type: "STAGE.ADD", index })}
    >
      <ViewStageButton>
        <animated.div
          style={{
            ...arrowProps,
            textAlign: "center",
            height: "100%",
            lineHeight: "2rem",
          }}
        >
          {">"}
        </animated.div>
        <animated.div
          style={{
            ...addProps,
            textAlign: "center",
            height: "100%",
            lineHeight: "2rem",
          }}
        >
          +
        </animated.div>
      </ViewStageButton>
    </ViewStageButtonContainer>
  );
});

const ViewStageDeleteDiv = animated(styled.div`
  box-sizing: border-box;
  border: 1px solid ${({ theme }) => theme.primary.plainColor};
  position: relative;
  border-top-right-radius: 3px;
  border-bottom-right-radius: 3px;
  cursor: pointer;
`);

const ViewStageDeleteButton = animated(styled.button`
  background-color: ${({ theme }) => theme.background.level1};
  border: none;
  padding: 0.5rem;
  color: ${({ theme }) => theme.text.primary};
  height: 1rem;
  display: block;
  height: 100%;
  border: none;
  cursor: pointer;
  font-weight: bold;
  margin: 0;

  :focus {
    outline: none;
  }
`);

const ViewStageDelete = React.memo(({ send, spring }) => {
  return (
    <ViewStageDeleteDiv style={spring} onClick={() => send("STAGE.DELETE")}>
      <ViewStageDeleteButton>
        <Close
          style={{
            fontSize: "14px",
            display: "block",
          }}
        />
      </ViewStageDeleteButton>
    </ViewStageDeleteDiv>
  );
});

const ViewStage = React.memo(({ barRef, stageRef }) => {
  const theme = useTheme();
  const [state, send] = useService(stageRef);
  const inputRef = useRef();
  const [containerRef, setContainerRef] = useState({});

  const {
    stage,
    stageInfo,
    parameters,
    results,
    currentResult,
    focusOnInit,
    active,
    bestMatch,
  } = state.context;

  const isCompleted = [
    "input.reading.selected",
    "input.reading.submitted",
  ].some(state.matches);

  const deleteProps = useSpring({
    borderColor:
      active && state.matches("focusedViewBar.yes")
        ? theme.primary.plainColor
        : theme.text.tertiary,
    opacity: 1,
    from: {
      opacity: 0,
    },
  });

  const props = useSpring({
    backgroundColor: isCompleted
      ? theme.background.level1
      : theme.background.viewBarButtons,
    borderRightWidth: state.matches("delible.yes") && parameters.length ? 0 : 1,
    borderColor:
      active && state.matches("focusedViewBar.yes")
        ? theme.primary.plainColor
        : theme.divider,
    borderTopRightRadius: !parameters.length ? 3 : 0,
    borderBottomRightRadius: !parameters.length ? 3 : 0,
    opacity: 1,
    from: {
      opacity: 0,
    },
    alignItems: "center",
  });

  const containerProps = useSpring({
    top: state.matches("focusedViewBar.yes") && state.context.active ? -3 : 0,
    config: config.stiff,
  });

  const isEditing = state.matches("input.editing");
  useEffect(() => {
    isEditing && inputRef.current && inputRef.current.focus();
    !isEditing && inputRef.current && inputRef.current.blur();
  }, [isEditing, inputRef.current]);

  return (
    <>
      <ViewStageContainer
        style={containerProps}
        ref={(node) =>
          node &&
          node !== containerRef.current &&
          setContainerRef({ current: node })
        }
      >
        <ViewStageDiv style={props}>
          <ViewStageInput
            placeholder={stage.length === 0 ? "+ add stage" : ""}
            value={stage}
            autoFocus={focusOnInit}
            onFocus={() => !isEditing && send("EDIT")}
            onBlur={(e) => {
              state.matches("input.editing.searchResults.notHovering") &&
                send("BLUR");
            }}
            onChange={(e) => send({ type: "CHANGE", value: e.target.value })}
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                const match = getMatch(
                  stageInfo.map((s) => s.name),
                  e.target.value
                );
                send({
                  type: "COMMIT",
                  value: match
                    ? match
                    : bestMatch.value
                    ? bestMatch.value
                    : e.target.value,
                });
              }
            }}
            onKeyDown={(e) => {
              switch (e.key) {
                case "Escape":
                  send("BLUR");
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
            style={{ fontSize: "1rem" }}
            ref={inputRef}
          />
          {state.matches("input.editing") ? (
            <BestMatchDiv>
              {bestMatch ? bestMatch.placeholder : ""}
            </BestMatchDiv>
          ) : null}
          {isCompleted && (
            <div
              style={{
                width: "1rem",
                height: "1rem",
                margin: "0.4rem 0.5rem 0.5rem 0",
              }}
            >
              <ExternalLink
                href={`https://voxel51.com/docs/fiftyone/api/fiftyone.core.stages.html#fiftyone.core.stages.${stage}`}
                style={{ maxHeight: "1rem", width: "1rem", display: "block" }}
              >
                <Help
                  style={{
                    width: "1rem",
                    height: "1rem",
                  }}
                />
              </ExternalLink>
            </div>
          )}
        </ViewStageDiv>
        {parameters
          .filter((p) => !p.parameter.startsWith("_"))
          .map((parameter) => (
            <ViewStageParameter
              key={parameter.parameter}
              parameterRef={parameter.ref}
              barRef={barRef}
              stageRef={stageRef}
            />
          ))}
        {parameters.length ? (
          <ViewStageDelete spring={deleteProps} send={send} />
        ) : null}
        {state.matches("input.editing") &&
          barRef.current &&
          containerRef.current && (
            <SearchResults
              results={results}
              send={send}
              currentResult={currentResult}
              bestMatch={bestMatch.value}
              followRef={containerRef}
              barRef={barRef}
            />
          )}
        {containerRef.current && (
          <ErrorMessage
            serviceRef={stageRef}
            followRef={containerRef}
            barRef={barRef}
          />
        )}
      </ViewStageContainer>
    </>
  );
});

export default ViewStage;
