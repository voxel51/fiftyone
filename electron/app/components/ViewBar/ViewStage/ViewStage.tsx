import React, { useContext, useEffect, useRef, useMemo } from "react";
import styled, { ThemeContext } from "styled-components";
import { animated, useSpring } from "react-spring";
import { useRecoilValue } from "recoil";
import { useService } from "@xstate/react";
import AuosizeInput from "react-input-autosize";

import SearchResults from "./SearchResults";
import ViewStageParameter from "./ViewStageParameter";
import ViewStageStories from "./ViewStage.stories";

const ViewStageContainer = styled.div`
  margin: 0.5rem 0.25rem;
  display: flex;
  position: relative;
`;

const ViewStageDiv = animated(styled.div`
  box-sizing: border-box;
  border: 2px dashed ${({ theme }) => theme.brand};
  border-top-left-radius: 3px;
  border-bottom-left-radius: 3px;
  border-right-width: 0;
  position: relative;
  display: flex;
`);

const ViewStageInput = styled(AuosizeInput)`
  & > input {
    background-color: transparent;
    border: none;
    margin: 0.5rem;
    color: ${({ theme }) => theme.font};
    line-height: 1rem;
    border: none;
  }

  & > input:focus {
    boder: none;
    outline: none;
  }

  & ::placeholder {
    color: ${({ theme }) => theme.font};
  }
`;

export const ViewStageButton = animated(styled.button`
  box-sizing: border-box;
  border: 2px dashed ${({ theme }) => theme.brand};
  color: ${({ theme }) => theme.font};
  border-radius: 3px;
  position: relative;
  margin: 0.5rem;
  line-height: 1rem;
  cursor: pointer;

  :focus {
    outline: none;
  }
`);

export const AddViewStage = React.memo(({ send, index }) => {
  const theme = useContext(ThemeContext);
  const [props, set] = useSpring(() => ({
    background: theme.brandMoreTransparent,
    opacity: 1,
    from: {
      opacity: 0,
    },
  }));

  return (
    <ViewStageButton
      style={props}
      onMouseEnter={() => set({ background: theme.brandTransparent })}
      onMouseLeave={() => set({ background: theme.brandMoreTransparent })}
      onClick={() => send({ type: "STAGE.ADD", index })}
    >
      +
    </ViewStageButton>
  );
});

const ViewStageDeleteDiv = animated(styled.div`
  box-sizing: border-box;
  border: 2px dashed ${({ theme }) => theme.brand};
  position: relative;
  border-top-right-radius: 3px;
  border-bottom-right-radius: 3px;
  border-left-width: 0;
  cursor: pointer;
`);

const ViewStageDeleteButton = animated(styled.button`
  background-color: transparent;
  border: none;
  margin: 0.5rem;
  color: ${({ theme }) => theme.font};
  line-height: 1rem;
  border: none;
  padding: 0;
  cursor: pointer;

  :focus {
    outline: none;
  }
`);

const ViewStageDelete = React.memo(({ send, spring }) => {
  return (
    <ViewStageDeleteDiv style={spring} onClick={() => send("STAGE.DELETE")}>
      <ViewStageDeleteButton>x</ViewStageDeleteButton>
    </ViewStageDeleteDiv>
  );
});

const ViewStage = React.memo(({ stageRef }) => {
  const theme = useContext(ThemeContext);
  const [state, send] = useService(stageRef);
  const inputRef = useRef(null);

  const {
    id,
    stage,
    submitted,
    hideDelete,
    stageInfo,
    parameters,
  } = state.context;

  const isCompleted = ["reading.selected", "reading.submitted"].some(
    state.matches
  );

  const deleteProps = useSpring({
    borderStyle: isCompleted ? "solid" : "dashed",
    backgroundColor: isCompleted
      ? theme.brandTransparent
      : theme.brandMoreTransparent,
    opacity: 1,
    from: {
      opacity: 0,
    },
  });

  const props = useSpring({
    borderStyle: isCompleted ? "solid" : "dashed",
    backgroundColor: isCompleted
      ? theme.brandTransparent
      : theme.brandMoreTransparent,
    borderRightWidth: isCompleted ? 0 : 2,
    borderTopRightRadius: hideDelete && !isCompleted ? 3 : 0,
    borderBottomRightRadius: hideDelete && !isCompleted ? 3 : 0,
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
    []
  );

  useEffect(() => {
    const listener = (state) => {
      state.actions.forEach((action) => {
        if (action.type in actionsMap) actionsMap[action.type]();
      });
    };
    stageRef.onTransition(listener);
    return () => stageRef.listeners.delete(listener);
  }, []);

  return (
    <ViewStageContainer>
      <ViewStageDiv style={props}>
        <ViewStageInput
          placeholder="+ add stage"
          value={stage}
          onFocus={() => !state.matches("editing") && send("EDIT")}
          onBlur={() =>
            state.matches("editing.searchResults.notHovering") && send("BLUR")
          }
          onChange={(e) => send({ type: "CHANGE", stage: e.target.value })}
          onKeyPress={(e) => {
            if (e.key === "Enter") {
              send({ type: "COMMIT", stage: e.target.value });
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              send("BLUR");
            }
          }}
          style={{ fontSize: "1rem" }}
          ref={inputRef}
        />
        {state.matches("editing") && (
          <SearchResults
            results={stageInfo
              .map((s) => s.name)
              .filter((n) => n.toLowerCase().includes(stage.toLowerCase()))}
            send={send}
          />
        )}
      </ViewStageDiv>
      {isCompleted &&
        parameters.map((parameter) => (
          <ViewStageParameter key={parameter.id} parameterRef={parameter.ref} />
        ))}
      {!hideDelete || submitted ? (
        <ViewStageDelete spring={deleteProps} send={send} />
      ) : null}
    </ViewStageContainer>
  );
});

export default ViewStage;
