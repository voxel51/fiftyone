import React, { useCallback } from "react";
import styled from "styled-components";
import { useSpring } from "react-spring";
import { useMachine } from "@xstate/react";
import { useRecoilState } from "recoil";
import { HotKeys } from "react-hotkeys";

import { stateDescription } from "../../recoil/atoms";
import ViewStage, { AddViewStage } from "./ViewStage/ViewStage";
import viewBarMachine, { createBar } from "./viewBarMachine";

const StyledHotKeys = styled(HotKeys)`
  &:focus {
    outline: none;
  }
`;

const ViewBarDiv = styled.div`
  background-color: ${({ theme }) => theme.backgroundDark};
  border-radius: 3px;
  border: 1px solid ${({ theme }) => theme.backgroundDarkBorder};
  box-sizing: border-box;
  height: 54px;
  width: 100%;
  padding: 0 0.25rem;
  overflow: auto;
  display: flex;

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
    outline: none;
  }
`;

/*const connectedViewBarMachine = viewBarMachine.withConfig(
  {
    actions: {
      submit: (ctx) => {
        // ...
      },
    },
  },
  // load view from recoil
  {
    stage: 
  }
);*/

export const viewBarKeyMap = {
  VIEW_BAR_FOCUS: "?",
  VIEW_BAR_BLUR: "esc",
  VIEW_BAR_NEXT: "right",
  VIEW_BAR_PREVIOUS: "left",
  VIEW_BAR_NEXT_STAGE: "shift+right",
  VIEW_BAR_PREVIOUS_STAGE: "shift+left",
  VIEW_BAR_DELETE_STAGE: ["del", "shift+backspace"],
  VIEW_BAR_NEXT_RESULT: "down",
  VIEW_BAR_PREVIOUS_RESULT: "up",
};

const machine = viewBarMachine.withContext(createBar(5151));

const ViewBar = () => {
  const [stateDescriptionValue, setStateDescription] = useRecoilState(
    stateDescription
  );
  const [state, send] = useMachine(machine);
  console.log(stateDescriptionValue);

  const { stages } = state.context;

  const handlers = {
    VIEW_BAR_FOCUS: useCallback(() => send("FOCUS"), [send]),
    VIEW_BAR_BLUR: useCallback(() => send("BLUR"), []),
    VIEW_BAR_NEXT: useCallback(() => send("NEXT"), []),
    VIEW_BAR_PREVIOUS: useCallback(() => send("PREVIOUS"), []),
    VIEW_BAR_NEXT_STAGE: useCallback(() => send("NEXT_STAGE"), []),
    VIEW_BAR_PREVIOUS_STAGE: useCallback(() => send("PREVIOUS_STAGE"), []),
    VIEW_BAR_DELETE_STAGE: useCallback(() => send("DELETE_STAGE"), []),
    VIEW_BAR_NEXT_RESULT: useCallback(() => send("NEXT_RESULT"), []),
    VIEW_BAR_PREVIOUS_RESULT: useCallback(() => send("PREVIOUS_RESULT"), []),
  };

  return (
    <StyledHotKeys
      handlers={handlers}
      onBlur={handlers.VIEW_BAR_BLUR}
      onFocus={handlers.VIEW_BAR_FOCUS}
    >
      <ViewBarDiv>
        {state.matches("running")
          ? stages.map((stage, i) => {
              return (
                <React.Fragment key={stage.id}>
                  {stage.submitted && (i === 0 || stages[i - 1].submitted) ? (
                    <AddViewStage
                      key={`insert-button-${stage.id}`}
                      send={send}
                      index={i}
                    />
                  ) : null}
                  <ViewStage key={stage.id} stageRef={stage.ref} />
                </React.Fragment>
              );
            })
          : null}
        {state.matches("running") && stages[stages.length - 1].submitted ? (
          <AddViewStage
            key={`insert-button-tail`}
            send={send}
            index={stages.length}
          />
        ) : null}
      </ViewBarDiv>
    </StyledHotKeys>
  );
};

export default ViewBar;
