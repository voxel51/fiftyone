import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useMemo,
  useState,
} from "react";
import styled, { ThemeContext } from "styled-components";
import { animated, useSpring, config } from "react-spring";
import { useService } from "@xstate/react";
import AuosizeInput from "react-input-autosize";
import { Add, KeyboardReturn as Arrow, Close, Help } from "@material-ui/icons";

import ErrorMessage from "./ErrorMessage";
import ExternalLink from "../../ExternalLink";
import SearchResults from "./SearchResults";
import ViewStageParameter from "./ViewStageParameter";
import { getMatch } from "./viewStageMachine";

const ViewStageContainer = animated(styled.div`
  margin: 0.5rem 0.25rem;
  display: flex;
  position: relative;
`);

const ViewStageDiv = animated(styled.div`
  box-sizing: border-box;
  border: 1px solid ${({ theme }) => theme.brand};
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
    margin: 0.5rem 0 0.5rem 0.5rem;
    color: ${({ theme }) => theme.font};
    line-height: 1rem;
    border: none;
    font-weight: bold;
  }

  & input:focus {
    border: none;
    outline: none;
    font-weight: bold;
  }

  & ::placeholder {
    color: ${({ theme }) => theme.font};
    font-weight: bold;
  }
`;

const ViewStageButtonContainer = animated(styled.div`
  box-sizing: border-box;
  border: 1px dashed ${({ theme }) => theme.fontDarkest};
  color: ${({ theme }) => theme.fontDarkest};
  border-radius: 3px;
  position: relative;
  margin: 0.5rem;
  line-height: 1rem;
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

const AddIcon = animated(styled(Add)`
  display: block;
  font-size: 14px;
`);

const addTransform = (y) => `translate3d(0, ${y}px, 0)`;

const ArrowIcon = animated(styled(Arrow)`
  position: absolute;
`);

const arrowTransform = (y) => `scale(-1, 1) translate3d(0, ${y}px, 0)`;

export const AddViewStage = React.memo(({ send, index, active }) => {
  const theme = useContext(ThemeContext);
  const [hovering, setHovering] = useState(false);
  const [props, set] = useSpring(() => ({
    background: theme.background,
    color: active ? theme.font : theme.fontDarkest,
    borderColor: active ? theme.brand : theme.fontDarkest,
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
      color: active ? theme.font : theme.fontDarkest,
      borderColor: active ? theme.brand : theme.fontDarkest,
    });
    active ? setEnterProps() : setLeaveProps();
  }, [active]);

  const [addProps, setAdd] = useSpring(() => ({
    y: active ? 0 : 40,
  }));

  const [arrowProps, setArrow] = useSpring(() => ({
    y: active ? -40 : 0,
  }));

  const setEnterProps = () => {
    set({ background: theme.background });
    setAdd({ y: 0 });
    setArrow({ y: -40 });
  };

  const setLeaveProps = () => {
    set({ background: theme.backgroundDark });
    setAdd({ y: 40 });
    setArrow({ y: 0 });
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
        <ArrowIcon
          style={{
            transform: arrowProps.y.interpolate(arrowTransform),
            display: "block",
            fontSize: "14px",
            margin: "9px 0",
          }}
        />
        <AddIcon
          style={{
            transform: addProps.y.interpolate(addTransform),
            display: "block",
            fontSize: "14px",
            margin: "9px 0",
          }}
        />
      </ViewStageButton>
    </ViewStageButtonContainer>
  );
});

const ViewStageDeleteDiv = animated(styled.div`
  box-sizing: border-box;
  border: 1px solid ${({ theme }) => theme.brand};
  position: relative;
  border-top-right-radius: 3px;
  border-bottom-right-radius: 3px;
  border-left-width: 0;
  cursor: pointer;
`);

const ViewStageDeleteButton = animated(styled.button`
  background-color: ${({ theme }) => theme.backgroundLight};
  border: none;
  padding: 0.5rem;
  color: ${({ theme }) => theme.font};
  line-height: 1rem;
  display: block;
  height: 100%;
  border: none;
  cursor: pointer;
  font-weight: bold;

  :focus {
    outline: none;
  }
`);

const BestMatchDiv = styled.div`
  background-color: transparent;
  border: none;
  margin: 0.5rem 0.5rem 0.5rem 0;
  color: ${({ theme }) => theme.brand};
  line-height: 1rem;
  border: none;
  font-weight: bold;
`;

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
  const theme = useContext(ThemeContext);
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
        ? theme.brand
        : theme.fontDarkest,
    opacity: 1,
    from: {
      opacity: 0,
    },
  });

  const props = useSpring({
    backgroundColor: isCompleted ? theme.backgroundLight : theme.background,
    borderRightWidth: state.matches("delible.yes") && parameters.length ? 0 : 1,
    borderColor:
      active && state.matches("focusedViewBar.yes")
        ? theme.brand
        : theme.fontDarkest,
    borderTopRightRadius: !parameters.length ? 3 : 0,
    borderBottomRightRadius: !parameters.length ? 3 : 0,
    opacity: 1,
    from: {
      opacity: 0,
    },
  });

  const actionsMap = useMemo(
    () => ({
      focusInput: () => inputRef.current && inputRef.current.select(),
      blurInput: () => inputRef.current && inputRef.current.blur(),
    }),
    [inputRef.current]
  );

  useEffect(() => {
    const listener = (state) => {
      state.actions.forEach((action) => {
        if (action.type in actionsMap) actionsMap[action.type]();
      });
      <ErrorMessage serviceRef={stageRef} />;
    };
    stageRef.onTransition(listener);
    return () => stageRef.listeners.delete(listener);
  }, []);

  const containerProps = useSpring({
    top: state.matches("focusedViewBar.yes") && state.context.active ? -3 : 0,
    config: config.stiff,
  });

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
            onFocus={() => !state.matches("input.editing") && send("EDIT")}
            onBlur={(e) => {
              state.matches("input.editing.searchResults.notHovering") &&
                send("BLUR");
            }}
            onChange={(e) => send({ type: "CHANGE", value: e.target.value })}
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                const match = getMatch(stageInfo, e.target.value);
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
          <BestMatchDiv>
            {state.matches("input.editing") ? bestMatch.placeholder : ""}
          </BestMatchDiv>
          {isCompleted && (
            <ExternalLink
              href={`https://voxel51.com/docs/fiftyone/api/fiftyone.core.stages.html#fiftyone.core.stages.${stage}`}
            >
              <Help
                style={{
                  cursor: "pointer",
                  width: "1rem",
                  height: "1rem",
                  margin: "0.5rem 0.5rem 0.5rem 0",
                }}
              />
            </ExternalLink>
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
        {state.matches("delible.yes") && parameters.length ? (
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
