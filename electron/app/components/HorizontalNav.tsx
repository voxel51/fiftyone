import React, { useState } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import { capitalize } from "lodash";

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

const Plots = styled.div``;

const Plot = styled.div`
  display: inline-block;
  margin-right: 5px;
  padding: 0 1em;
  color: ${({ theme }) => theme.font};
  background-color: ${({ theme }) => theme.backgroundLight};
  text-decoration: none;
  font-weight: bold;
  text-transform: capitalize;
  border-radius: 2px;

  &.active {
    background-color: ${({ theme }) => theme.secondary};
  }
`;

const TogglePlots = styled.button``;

const HorizontalNav = ({ entries }: Props) => {
  const activePlot = useRecoilValue(atoms.activePlot);
  const [expanded, setExpanded] = useState(false);

  return (
    <Body>
      <Plots>
        {entries.map((e) => (
          <Plot key={e} className={e === activePlot ? "active" : ""}>
            {capitalize(e)}
          </Plot>
        ))}
      </Plots>
      <TogglePlots>hello</TogglePlots>
    </Body>
  );
};

export default HorizontalNav;
