import React from "react";
import styled from "styled-components";
import { summarizeLongStr } from "../../utils/generic";

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
  onClick: () => void;
  maxLen?: number;
}

const Result = React.memo(
  ({ active, highlight, result, onClick, maxLen }: ResultProps) => {
    const props = useHighlightHover(
      false,
      active ? active : null,
      result === null ? highlight : null
    );

    const text = result === null ? "None" : result;

    return (
      <ResultDiv
        title={result === null ? "None" : result}
        {...props}
        onClick={onClick}
      >
        {maxLen ? summarizeLongStr(text, maxLen, "middle") : text}
      </ResultDiv>
    );
  }
);

type ResultValue = string | null;

interface ResultsProps {
  results: ResultValue[];
  highlight: string;
  onSelect: (result: ResultValue) => void;
  active: ResultValue;
  alignRight?: boolean;
}

const Results = React.memo(
  ({ onSelect, results, highlight, active = undefined }: ResultsProps) => {
    return (
      <>
        {results.map((result) => (
          <Result
            key={result}
            result={result}
            highlight={highlight}
            onClick={() => onSelect(result)}
            active={active === result}
            maxLen={36}
          />
        ))}
      </>
    );
  }
);

export default Results;
