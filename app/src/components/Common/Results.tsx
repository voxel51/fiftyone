import React from "react";
import styled from "styled-components";

import { ItemAction, useHighlightHover } from "../Actions/utils";

export const ResultsContainer = styled.div`
  background-color: ${({ theme }) => theme.backgroundDark};
  border: 1px solid ${({ theme }) => theme.backgroundDarkBorder};
  border-radius: 2px;
  box-shadow: 0 2px 20px ${({ theme }) => theme.backgroundDark};
  box-sizing: border-box;
  margin-top: 2.5rem;
  position: fixed;
  width: auto;
  z-index: 801;
  max-height: 328px;
  overflow-y: scroll;
  scrollbar-width: none;

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

interface ResultProps {
  result: ResultValue;
  highlight: string;
  active: boolean;
  onClick: () => void;
}

const Result = React.memo(({ highlight, result }: ResultProps) => {
  const props = useHighlightHover(false);
  return (
    <ItemAction style={result === null ? { color: highlight } : {}} {...props}>
      {result === null ? "None" : result}
    </ItemAction>
  );
});

type ResultValue = string | null;

interface ResultsProps {
  results: ResultValue[];
  highlight: string;
  onSelect: (result: ResultValue) => void;
  active: ResultValue;
}

const Results = React.memo(
  ({ onSelect, results, highlight, active = undefined }: ResultsProps) => {
    return (
      <>
        {results.map((result) => (
          <Result
            result={result}
            highlight={highlight}
            onClick={() => onSelect(result)}
            active={active === result}
          />
        ))}
      </>
    );
  }
);

export default Results;
