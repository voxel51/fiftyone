import React, { useEffect, useRef } from "react";
import styled from "styled-components";
import { animated, useSpring } from "react-spring";
import { useRecoilValue } from "recoil";
import { useService } from "@xstate/react";

import { grey46 as fontColor } from "../../../shared/colors";
import SearchResults from "./SearchResults";

const ViewStageDiv = animated(styled.div`
  box-sizing: border-box;
  border: 1px dashed #6c757d;
  border-radius: 3px;
  background-color: rgba(108, 117, 125, 0.13);
  display: inline-block;
  margin: 0.5rem;
  position: relative;
`);

const ViewStageInput = styled.input`
  background-color: transparent;
  border: none;
  line-height: 1rem;
  margin: 0.5rem;
  width: auto;
  color: ${fontColor};
  max-width: 6.5rem;

  :focus {
    boder: none;
    outline: none;
  }
`;

export const ViewStageButton = styled.button``;

export default React.memo(({ stageRef, tailStage, stageInfo }) => {
  const [state, send] = useService(stageRef);
  const inputRef = useRef(null);

  const { stage } = state.context;

  const props = useSpring({
    borderStyle: true ? "dashed" : "solid",
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

  console.log(state);

  return (
    <ViewStageDiv style={props}>
      {tailStage ? (
        <ViewStageInput
          placeholder="+ search sample"
          value={stage}
          onBlur={() => send("BLUR")}
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
          ref={inputRef}
        />
      ) : (
        <ViewStageButton>+</ViewStageButton>
      )}
      {state.matches("editing") && (
        <SearchResults
          results={stageInfo
            .map((s) => s.name)
            .filter((n) => n.includes(stage))}
          send={send}
        />
      )}
    </ViewStageDiv>
  );
});
