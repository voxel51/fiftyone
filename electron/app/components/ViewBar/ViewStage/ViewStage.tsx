import React, { useEffect, useRef } from "react";
import styled from "styled-components";
import { animated, useSpring } from "react-spring";
import { useRecoilValue } from "recoil";
import { useService } from "@xstate/react";
import AuosizeInput from "react-input-autosize";

import { grey46 as fontColor } from "../../../shared/colors";
import SearchResults from "./SearchResults";
import ViewStageParameter from "./ViewStageParameter";

const ViewStageContainer = styled.div`
  margin: 0.5rem;
`;

const ViewStageDiv = animated(styled.div`
  box-sizing: border-box;
  border: 2px dashed #6c757d;
  border-radius: 3px;
  background-color: rgba(108, 117, 125, 0.13);
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

  const props = useSpring({
    borderStyle: state.matches("reading.selected") ? "solid" : "dashed",
    borderTopRightRadius: state.matches("reading.selected") ? 0 : 3,
    borderBottomRightRadius: state.matches("reading.selected") ? 0 : 3,
    borderRightWidth: state.matches("reading.selected") ? 1 : 2,
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
    });
  }, [state, stageRef]);
  console.log(state.toStrings(), parameters);

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
                send("COMMIT");
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
      {state.matches("reading.selected") &&
        parameters.map((parameter) => (
          <ViewStageParameter key={parameter.id} parameterRef={parameter.ref} />
        ))}
    </ViewStageContainer>
  );
});
