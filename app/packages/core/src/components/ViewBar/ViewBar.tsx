import React, { useEffect, useCallback, useRef } from "react";
import styled from "styled-components";
import { useMachine } from "@xstate/react";
import { useRecoilValue } from "recoil";
import { GlobalHotKeys } from "react-hotkeys";
import { Close, Help } from "@mui/icons-material";

import { useOutsideClick } from "@fiftyone/state";
import { ExternalLink } from "../../utils/generic";

import ViewStage, { AddViewStage } from "./ViewStage/ViewStage";
import viewBarMachine from "./viewBarMachine";

import * as fos from "@fiftyone/state";
import { useTheme } from "@fiftyone/components";

const ViewBarDiv = styled.div`
  position: relative;
  background-color: ${({ theme }) => theme.background.level2};
  border-radius: 3px;
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};
  box-sizing: border-box;
  height: 52px;
  width: 100%;
  display: flex;
  overflow-x: scroll;
  scrollbar-width: none;
  min-width: 200px;

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
  display: flex;
  align-items: center;
  position: absolute;
  z-index: 1;
  height: 100%;
  border-radius: 3px;
  top 2px;
  height: 48px;
  right: 1px;
  background-image: linear-gradient(
    to right,
    rgba(0, 0, 0, 0),
    30%,
    ${({ theme }) => theme.background.level2}
  );
  column-gap: 0.5rem;
  padding: 0 0.5rem;
  z-index: 801;
`;

const viewBarKeyMap = {
  VIEW_BAR_NEXT: "right",
  VIEW_BAR_PREVIOUS: "left",
  VIEW_BAR_NEXT_STAGE: "shift+right",
  VIEW_BAR_PREVIOUS_STAGE: "shift+left",
  VIEW_BAR_DELETE: ["del", "backspace"],
  VIEW_BAR_ENTER: "enter",
};

const ViewBar = React.memo(() => {
  const [state, send] = useMachine(viewBarMachine);
  const view = useRecoilValue(fos.view);
  const setView = fos.useSetView();

  const fieldPaths = useRecoilValue(fos.fieldPaths({}));

  useEffect(() => {
    send({
      type: "UPDATE",
      view,
      setView,
      fieldNames: fieldPaths,
    });
  }, [view]);

  const { stages, activeStage } = state.context;
  const barRef = useRef(null);

  const handlers = {
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

  const theme = useTheme();
  useOutsideClick(
    barRef,
    () => state.matches("running.focus.focused") && send("TOGGLE_FOCUS")
  );

  return (
    <div
      style={{
        position: "relative",
        flex: "1",
        marginRight: "0.5rem",
        overflow: "hidden",
      }}
    >
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
        <div
          style={{
            display: "block",
            minWidth: 64,
            maxWidth: 64,
            height: "100%",
          }}
        ></div>
      </ViewBarDiv>
      <IconsContainer>
        <Close
          onClick={() => send("CLEAR")}
          style={{
            cursor: "pointer",
            color: theme.text.secondary,
          }}
        />
        <ExternalLink
          href="https://voxel51.com/docs/fiftyone/user_guide/app.html#using-the-view-bar"
          style={{ display: "flex" }}
        >
          <Help style={{ color: theme.text.secondary }} />
        </ExternalLink>
      </IconsContainer>
    </div>
  );
});

export default ViewBar;
