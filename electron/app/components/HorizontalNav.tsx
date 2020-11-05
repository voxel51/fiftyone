import React, { useContext, useState } from "react";
import { animated, useSpring } from "react-spring";
import { useRecoilState } from "recoil";
import styled, { ThemeContext } from "styled-components";
import AssessmentIcon from "@material-ui/icons/Assessment";
import KeyboardArrowDownIcon from "@material-ui/icons/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@material-ui/icons/KeyboardArrowUp";

import Distributions from "./Distributions";
import * as atoms from "../recoil/atoms";

export type Props = {
  entries: string[];
};

const Container = animated(styled.div`
  padding: 1rem 0 0;
  background-color: ${({ theme }) => theme.backgroundDark};
  border-bottom: 1px ${({ theme }) => theme.backgroundDarkBorder} solid;
`);

const Nav = styled.div`
  padding: 0 1rem;
  width: 100%;
  display: flex;
  justify-content: space-between;
`;

const PlotsButtons = styled.div``;

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

const HorizontalNav = ({ entries }: Props) => {
  const theme = useContext(ThemeContext);
  const [activePlot, setActivePlot] = useRecoilState(atoms.activePlot);
  const [expanded, setExpanded] = useState(false);
  const togglePlotButton = useSpring({
    opacity: 1,
    backgroundColor: expanded ? theme.button : theme.brand,
    from: {
      opacity: 0,
    },
  });

  const container = useSpring({
    height: expanded ? 392 : 64,
  });

  return (
    <Container style={container}>
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
        <TogglePlotsButton
          onClick={() => setExpanded(!expanded)}
          style={togglePlotButton}
        >
          <AssessmentIcon />
          <span>{expanded ? "Hide" : "Show"}</span>
          {expanded ? <KeyboardArrowDownIcon /> : <KeyboardArrowUpIcon />}
        </TogglePlotsButton>
      </Nav>
      {expanded && <Distributions key={activePlot} group={activePlot} />}
    </Container>
  );
};

export default HorizontalNav;
