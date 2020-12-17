import React, { useContext, useEffect, useState } from "react";
import { animated, useSpring } from "react-spring";
import { useRecoilState } from "recoil";
import styled, { ThemeContext } from "styled-components";
import {
  Assessment,
  DragHandle,
  Fullscreen,
  FullscreenExit,
  KeyboardArrowDown,
  KeyboardArrowUp,
} from "@material-ui/icons";

import Distributions from "./Distributions";
import { useWindowSize } from "../utils/hooks";
import * as atoms from "../recoil/atoms";
import { Resizable } from "re-resizable";

export type Props = {
  entries: string[];
};

const Drag = styled(DragHandle)`
  position: absolute;
  bottom: -0.8rem;
  height: 1rem;
  width: 1rem;
  left: 50%;
  margin-left: -0.5rem;
  z-index: 1000;
  pointer-events: none;
`;

const Container = styled(Resizable)`
  padding: 1rem 0 0;
  background-color: ${({ theme }) => theme.backgroundDark};
  border-bottom: 1px ${({ theme }) => theme.backgroundDarkBorder} solid;
`;

const Nav = styled.div`
  padding: 0 1rem;
  width: 100%;
  display: flex;
  justify-content: space-between;
`;

const NavButtons = styled.div`
  display: flex;
  justify-content: space-between;
`;

const PlotsButtons = styled.div`
  padding-bottom: 1rem;
`;

const PlotButton = styled.div`
  height: 1.5rem;
  line-height: 1.5rem;
  margin: 0.25rem 0.25rem 0.25rem 0;
  cursor: pointer;
  display: inline-block;
  margin-right: 5px;
  padding: 0 1em;
  color: ${({ theme }) => theme.font};
  background-color: ${({ theme }) => theme.backgroundLight};
  text-decoration: none;
  text-transform: capitalize;
  border-radius: 2px;
  font-weight: bold;

  &.active {
    background-color: ${({ theme }) => theme.secondary};
  }
`;

const TogglePlotsButton = animated(styled.div`
  line-height: 2rem;
  padding: 0 0.5rem;
  cursor: pointer;
  background-color: ${({ theme }) => theme.button};
  height: 2rem;
  border-radius: 1rem;
  border: none;
  font-weight: bold;
  display: flex;
  justify-content: space-between;

  &.hidden {
    background-color: ${({ theme }) => theme.brand};
  }
  & > svg {
    padding: 0.25rem;
    height: 2rem;
    width: 2rem;
  }
`);

const ToggleMaximizeContainer = styled.div`
  cursor: pointer;
  width: 1.5rem;
  height: 1.5rem;
  margin: 0.25rem;
`;

const ToggleMaximize = React.memo(({ maximized, setMaximized }) => {
  return (
    <ToggleMaximizeContainer onClick={() => setMaximized(!maximized)}>
      {maximized ? <FullscreenExit /> : <Fullscreen />}
    </ToggleMaximizeContainer>
  );
});

const HorizontalNav = ({ entries }: Props) => {
  const theme = useContext(ThemeContext);
  const { height: windowHeight } = useWindowSize();
  const [activePlot, setActivePlot] = useRecoilState(atoms.activePlot);
  const [expanded, setExpanded] = useState(false);
  const [openedHeight, setOpenedHeight] = useState(392);
  const [maximized, setMaximized] = useState(false);
  const closedHeight = 64;
  const togglePlotButton = useSpring({
    opacity: 1,
    backgroundColor: expanded ? theme.button : theme.brand,
    from: {
      opacity: 0,
    },
  });

  const height = expanded ? openedHeight : closedHeight;
  const resizable = expanded;

  return (
    <Container
      size={{ height: maximized ? windowHeight - 73 : height }}
      minHeight={closedHeight}
      enable={{
        top: false,
        right: false,
        bottom: expanded && !maximized,
        left: false,
        topRight: false,
        bottomRight: false,
        bottomLeft: false,
        topLeft: false,
      }}
      onResizeStop={(e, direction, ref, d) => {
        setOpenedHeight(height + d.height);
      }}
    >
      <Nav>
        <PlotsButtons>
          {entries.map((e) => (
            <PlotButton
              key={e}
              className={e === activePlot && expanded ? "active" : ""}
              onClick={() => {
                setExpanded(true);
                setActivePlot(e);
              }}
            >
              {e}
            </PlotButton>
          ))}
        </PlotsButtons>
        <NavButtons>
          {expanded && (
            <ToggleMaximize
              maximized={maximized}
              setMaximized={() => {
                setMaximized(!maximized);
                setExpanded(true);
              }}
            />
          )}
          <TogglePlotsButton
            onClick={() => {
              setExpanded(!expanded);
              expanded && setMaximized(false);
            }}
            style={togglePlotButton}
          >
            <Assessment />
            <span>{expanded ? "Hide" : "Show"}</span>
            {expanded ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
          </TogglePlotsButton>
        </NavButtons>
      </Nav>
      {expanded && <Distributions key={activePlot} group={activePlot} />}
      {expanded && !maximized && <Drag />}
    </Container>
  );
};

export default HorizontalNav;
