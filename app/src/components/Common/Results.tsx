import React from "react";
import styled from "styled-components";

import { ItemAction, useHighlightHover } from "../Actions/utils";

export const ResultsContainer = styled.div`
  background-color: ${({ theme }) => theme.backgroundDark};
  border: 1px solid ${({ theme }) => theme.backgroundDarkBorder};
  border-radius: 2px;
  box-shadow: 0 2px 20px ${({ theme }) => theme.backgroundDark};
  box-sizing: border-box;
  margin-top: 0;
  position: absolute;
  width: auto;
  z-index: 801;
  overflow-y: scroll;
  scrollbar-width: none;
  padding: 0 0.5rem;
  width: calc(100% - 12px);
  left: 6px;
  margin-bottom: 1rem;

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

const ResultDiv = styled(ItemAction)`
  white-space: nowrap;
  overflow: hidden;
  display: block;
  text-overflow: ellipsis;
`;

interface ResultProps {
  result: ResultValue;
  highlight: string;
  active: boolean;
  alignRight: boolean;
  onClick: () => void;
}

const Result = React.memo(({ highlight, result, onClick }: ResultProps) => {
  const props = useHighlightHover(
    false,
    null,
    result === null ? highlight : null
  );

  return (
    <ResultDiv
      title={result === null ? "None" : result}
      {...props}
      onClick={onClick}
    >
      {result === null ? "None" : result}
    </ResultDiv>
  );
});

type ResultValue = string | null;

interface ResultsProps {
  results: ResultValue[];
  highlight: string;
  onSelect: (result: ResultValue) => void;
  active: ResultValue;
  alignRight?: boolean;
}

const Results = React.memo(
  ({
    onSelect,
    results,
    highlight,
    active = undefined,
    alignRight,
  }: ResultsProps) => {
    return (
      <>
        {results.map((result) => (
          <Result
            result={result}
            highlight={highlight}
            onClick={() => onSelect(result)}
            active={active === result}
            alignRight={alignRight}
          />
        ))}
      </>
    );
  }
);

export default Results;
