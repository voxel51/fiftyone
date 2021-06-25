import React from "react";
import styled from "styled-components";
import { summarizeLongStr } from "../../utils/generic";

import { useHighlightHover } from "../Actions/utils";
import { ItemAction } from "../Actions/ItemAction";

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
  padding: 0 0.5rem;
  width: calc(100% - 12px);
  left: 6px;
  margin-bottom: 1rem;
`;

const ResultDiv = styled(ItemAction)`
  white-space: nowrap;
  overflow: hidden;
  display: flex;
  text-overflow: ellipsis;
  margin: 0;
  justify-content: space-between;
`;

const ScrollResultsContainer = styled.div`
  margin-left: -0.5rem;
  margin-right: -0.5rem;
  max-height: 330px;
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
  maxLen?: number;
}

const Result = React.memo(
  ({
    active,
    highlight,
    result: [value, count],
    onClick,
    maxLen,
  }: ResultProps) => {
    const props = useHighlightHover(
      false,
      active ? active : null,
      value === null ? highlight : null
    );

    const text = value === null ? "None" : value;

    return (
      <ResultDiv
        title={value === null ? "None" : value}
        {...props}
        onClick={onClick}
      >
        <span>{maxLen ? summarizeLongStr(text, maxLen, "middle") : text}</span>
        <span>{count}</span>
      </ResultDiv>
    );
  }
);

type ResultValue = [string | null, number];

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
      <ScrollResultsContainer>
        {results.map((result) => (
          <Result
            key={result[0]}
            result={result}
            highlight={highlight}
            onClick={() => onSelect(result)}
            active={active === result}
            maxLen={34}
          />
        ))}
      </ScrollResultsContainer>
    );
  }
);

export default Results;
