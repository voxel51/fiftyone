import React, { useContext, useState } from "react";
import { animated, useSpring } from "react-spring";
import { useRecoilValue } from "recoil";
import styled, { ThemeContext } from "styled-components";
import AssessmentIcon from "@material-ui/icons/Assessment";
import KeyboardArrowDownIcon from "@material-ui/icons/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@material-ui/icons/KeyboardArrowUp";

import * as atoms from "../recoil/atoms";

export type Props = {
  entries: string[];
};

const Body = styled.div`
  padding: 1rem;
  background-color: ${({ theme }) => theme.backgroundDark};
  border-bottom: 1px ${({ theme }) => theme.backgroundDarkBorder} solid;
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
`);

const HorizontalNav = ({ entries }: Props) => {
  const theme = useContext(ThemeContext);
  const activePlot = useRecoilValue(atoms.activePlot);
  const [expanded, setExpanded] = useState(false);
  const togglePlotButton = useSpring({
    opacity: 1,
    backgroundColor: expanded ? theme.button : theme.brand,
    from: {
      opacity: 0,
    },
  });

  return (
    <Body>
      <PlotsButtons>
        {entries.map((e) => (
          <PlotButton key={e} className={e === activePlot ? "active" : ""}>
            {e}
          </PlotButton>
        ))}
      </PlotsButtons>
      <TogglePlotsButton
        onClick={() => setExpanded(!expanded)}
        style={togglePlotButton}
      >
        <AssessmentIcon />
        <span style={{ padding: "0 1rem" }}>{expanded ? "Hide" : "Show"}</span>
        {expanded ? <KeyboardArrowDownIcon /> : <KeyboardArrowUpIcon />}
      </TogglePlotsButton>
    </Body>
  );
};

export default HorizontalNav;
