import React, { useContext, useEffect, useRef, useMemo } from "react";
import styled, { ThemeContext } from "styled-components";
import { animated, useSpring } from "react-spring";
import { useRecoilValue } from "recoil";
import { useService } from "@xstate/react";
import AuosizeInput from "react-input-autosize";

import SearchResults from "./SearchResults";
import ViewStageParameter from "./ViewStageParameter";

const ViewStageContainer = styled.div`
  margin: 0.5rem 0.25rem;
  display: inline-block;
`;

const ViewStageDiv = animated(styled.div`
  box-sizing: border-box;
  border: 2px dashed ${({ theme }) => theme.brand};
  border-radius: 3px;
  display: inline-block;
  position: relative;
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
  display: inline-block;
  position: relative;
  margin: 0.25rem;
  line-height: 1rem;
  padding: 0.5rem;
  cursor: pointer;

  :focus {
    outline: none;
  }
`);

export const AddViewStage = React.memo(({ send, insertAt }) => {
  const theme = useContext(ThemeContext);
  const props = useSpring({
    background: theme.brandMoreTransparent,
    opacity: 1,
    from: {
      opacity: 0,
    },
  });

  return (
    <ViewStageButton
      style={props}
      onClick={() => send({ type: "STAGE.ADD", insertAt })}
    >
      +
    </ViewStageButton>
  );
});

const DeleteViewStageButton = animated(styled.div`
  display: inline-block;
  box-sizing: border-box;
  border: 2px solid ${({ theme }) => theme.brand};
`);

const DeleteViewStage = ({ spring }) => {
  return <DeleteViewStageButton style={spring}>x</DeleteViewStageButton>;
};

const ViewStage = React.memo(({ stageRef }) => {
  const theme = useContext(ThemeContext);
  const [state, send] = useService(stageRef);
  const inputRef = useRef(null);

  const { id, stage, stageInfo, parameters } = state.context;

  const isCompleted = ["reading.selected", "reading.submitted"].some(
    state.matches
  );

  const props = useSpring({
    borderStyle: isCompleted ? "solid" : "dashed",
    borderTopRightRadius: isCompleted ? 0 : 3,
    borderBottomRightRadius: isCompleted ? 0 : 3,
    borderRightWidth: isCompleted ? 1 : 2,
    backgroundColor: isCompleted
      ? theme.brandTransparent
      : theme.brandMoreTransparent,
    opacity: 1,
    from: {
      opacity: 0,
    },
  });

  const [deleteProps, setDeleteProps] = useSpring(() => ({
    display: "none",
  }));

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
    <ViewStageContainer
      onMouseEnter={() => setDeleteProps({ display: "block" })}
      onMouseLeave={() => setDeleteProps({ display: "none" })}
    >
      <ViewStageDiv style={props}>
        <ViewStageInput
          placeholder="+ search sample"
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
    </ViewStageContainer>
  );
});

export default ViewStage;
