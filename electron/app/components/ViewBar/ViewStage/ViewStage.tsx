import React, { useEffect, useRef, useMemo } from "react";
import styled from "styled-components";
import { animated, useSpring } from "react-spring";
import { useRecoilValue } from "recoil";
import { useService } from "@xstate/react";
import AuosizeInput from "react-input-autosize";

import {
  grey46 as fontColor,
  grey46a30 as backgroundColorIncomplete,
  white100 as backgroundColorComplete,
} from "../../../shared/colors";
import SearchResults from "./SearchResults";
import ViewStageParameter from "./ViewStageParameter";

const borderColor = fontColor;

const ViewStageContainer = styled.div`
  margin: 0.5rem 0.25rem;
  display: inline-block;
`;

const ViewStageDiv = animated(styled.div`
  box-sizing: border-box;
  border: 2px dashed ${borderColor};
  border-radius: 3px;
  display: inline-block;
  position: relative;
`);

const ViewStageInput = styled(AuosizeInput)`
  & > input {
    background-color: transparent;
    border: none;
    margin: 0.5rem;
    color: ${fontColor};
    line-height: 1rem;
    border: none;
  }

  & > input:focus {
    boder: none;
    outline: none;
  }
`;

export const ViewStageButton = animated(styled.button`
  box-sizing: border-box;
  border: 2px dashed ${borderColor};
  color: ${fontColor};
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

export const AddViewStage = ({ send, insertAt }) => {
  const props = useSpring({
    background: backgroundColorIncomplete,
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
};

export default React.memo(({ stageRef }) => {
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
      ? backgroundColorComplete
      : backgroundColorIncomplete,
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
    stageRef.onTransition((state) => {
      state.actions.forEach((action) => {
        if (action.type in actionsMap) actionsMap[action.type]();
      });
    });
  }, [actionsMap, inputRef.current]);

  return (
    <ViewStageContainer>
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
