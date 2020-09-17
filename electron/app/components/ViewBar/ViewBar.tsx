import React, { useEffect, useCallback, useMemo, useRef } from "react";
import styled from "styled-components";
import { useMachine } from "@xstate/react";
import { useRecoilState, useRecoilValue } from "recoil";
import { GlobalHotKeys } from "react-hotkeys";
import { Close, Help } from "@material-ui/icons";

import { useOutsideClick } from "../../utils/hooks";
import { port, stateDescription } from "../../recoil/atoms";
import ExternalLink from "../ExternalLink";
import ViewStage, { AddViewStage } from "./ViewStage/ViewStage";
import viewBarMachine from "./viewBarMachine";

const ViewBarContainer = styled.div`
  position: relative;
  width: 100%;
  background-color: ${({ theme }) => theme.background};
  padding: 1rem 0;
`;

const ViewBarDiv = styled.div`
  background-color: ${({ theme }) => theme.backgroundDark};
  border-radius: 3px;
  border: 1px solid ${({ theme }) => theme.backgroundDarkBorder};
  box-sizing: border-box;
  height: 52px;
  width: 100%;
  padding: 0 0.25rem;
  display: flex;
  overflow-x: scroll;

  &::-webkit-scrollbar {
    width: 0px;
    background: transparent;
    display: none;
  }
  &::-webkit-scrollbar-thumb {
    width: 0px;
    display: none;
  }
`;

const IconsContainer = styled.div`
  position: absolute;
  z-index: 904;
  top: 30px;
  right: 0.5rem;
  display: flex;
`;

const viewBarKeyMap = {
  VIEW_BAR_TOGGLE_FOCUS: "esc",
  VIEW_BAR_NEXT: "right",
  VIEW_BAR_PREVIOUS: "left",
  VIEW_BAR_NEXT_STAGE: "shift+right",
  VIEW_BAR_PREVIOUS_STAGE: "shift+left",
  VIEW_BAR_DELETE: ["del", "backspace"],
  VIEW_BAR_ENTER: "enter",
};

const ViewBar = React.memo(() => {
  const [state, send] = useMachine(viewBarMachine);
  const [stateDescriptionValue, setStateDescription] = useRecoilState(
    stateDescription
  );
  const portValue = useRecoilValue(port);

  useEffect(() => {
    send({
      type: "UPDATE",
      port: portValue,
      stateDescription: stateDescriptionValue,
      setStateDescription,
    });
  }, [portValue, stateDescriptionValue, setStateDescription]);

  const { stages, activeStage } = state.context;
  const barRef = useRef(null);

  const handlers = {
    VIEW_BAR_TOGGLE_FOCUS: useCallback(() => send("TOGGLE_FOCUS"), []),
    VIEW_BAR_NEXT: useCallback(() => send("NEXT"), []),
    VIEW_BAR_PREVIOUS: useCallback(() => send("PREVIOUS"), []),
    VIEW_BAR_NEXT_STAGE: useCallback(() => send("NEXT_STAGE"), []),
    VIEW_BAR_PREVIOUS_STAGE: useCallback(() => send("PREVIOUS_STAGE"), []),
    VIEW_BAR_DELETE: useCallback(() => send("DELETE_ACTIVE_STAGE"), []),
    VIEW_BAR_ENTER: useCallback((e) => {
      e.preventDefault();
      send("ENTER");
    }, []),
  };

  useOutsideClick(
    barRef,
    () => state.matches("running.focus.focused") && send("TOGGLE_FOCUS")
  );

  return (
    <ViewBarContainer>
      <GlobalHotKeys handlers={handlers} keyMap={viewBarKeyMap} />
      <ViewBarDiv
        onClick={() =>
          state.matches("running.focus.blurred") && send("TOGGLE_FOCUS")
        }
        ref={barRef}
      >
        {state.matches("running")
          ? stages.map((stage, i) => {
              return (
                <React.Fragment key={stage.id}>
                  {stage.submitted && (i === 0 || stages[i - 1].submitted) ? (
                    <AddViewStage
                      key={`insert-button-${stage.id}`}
                      send={send}
                      index={i}
                      active={
                        activeStage === i - 0.5 &&
                        state.matches("running.focus.focused")
                      }
                    />
                  ) : null}
                  <ViewStage
                    key={stage.id}
                    stageRef={stage.ref}
                    barRef={barRef}
                  />
                </React.Fragment>
              );
            })
          : null}
        {state.matches("running") && stages[stages.length - 1].submitted ? (
          <AddViewStage
            key={`insert-button-tail`}
            send={send}
            index={stages.length}
            active={
              activeStage === stages.length - 0.5 &&
              state.matches("running.focus.focused")
            }
          />
        ) : null}
      </ViewBarDiv>

      <IconsContainer>
        <Close
          onClick={() => send("CLEAR")}
          style={{
            cursor: "pointer",
          }}
        />
        <ExternalLink href="https://voxel51.com/docs/fiftyone/user_guide/app.html">
          <Help />
        </ExternalLink>
      </IconsContainer>
    </ViewBarContainer>
  );
});

export default ViewBar;
