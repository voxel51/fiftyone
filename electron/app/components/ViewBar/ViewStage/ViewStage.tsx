import React, { useEffect, useRef } from "react";
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
  margin: 0.5rem;
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

export const ViewStageButton = styled.button``;

export default React.memo(({ stageRef, tailStage }) => {
  const [state, send] = useService(stageRef);
  const inputRef = useRef(null);

  const { stage, stageInfo, parameters } = state.context;

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

  useEffect(() => {
    stageRef.execute(state, {
      focusInput() {
        inputRef.current && inputRef.current.select();
      },

      blurInput() {
        inputRef.current && inputRef.current.blur();
      },
    });
  }, [state, stageRef]);

  return (
    <ViewStageContainer>
      <ViewStageDiv style={props}>
        {tailStage ? (
          <ViewStageInput
            placeholder="+ search sample"
            value={stage}
            onFocus={() => send("EDIT")}
            onBlur={() =>
              state.matches("editing.searchResults.notHovering") && send("BLUR")
            }
            onChange={(e) => send("CHANGE", { stage: e.target.value })}
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                send({ type: "COMMIT", stage: e.target.value });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                send("CANCEL");
              }
            }}
            style={{ fontSize: "1rem" }}
            ref={inputRef}
          />
        ) : (
          <ViewStageButton>+</ViewStageButton>
        )}
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
