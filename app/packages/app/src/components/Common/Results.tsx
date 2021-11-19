import React, { useEffect, useRef } from "react";
import styled from "styled-components";
import { summarizeLongStr } from "../../utils/generic";

import { useHighlightHover } from "../Actions/utils";
import { ItemAction } from "../Actions/ItemAction";
import { getValueString } from "../Filters/utils";

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
  flex-direction: row;
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
  active: boolean | null;
  onClick: () => void;
  maxLen?: number;
  color: string;
}

const Result = React.memo(
  ({
    active,
    highlight,
    result: [value, count],
    onClick,
    maxLen,
    color,
  }: ResultProps) => {
    const props = useHighlightHover(
      false,
      active ? active : null,
      value === null ? highlight : null
    );
    const ref = useRef<HTMLDivElement>();
    const wasActive = useRef(false);

    const [text, coloring] = getValueString(value);

    useEffect(() => {
      if (active && ref.current && !wasActive.current) {
        ref.current.scrollIntoView(true);
        wasActive.current = true;
      } else if (!active) {
        wasActive.current = false;
      }
    }, [active]);

    return (
      <ResultDiv
        title={value === null ? "None" : value}
        {...props}
        onClick={onClick}
        ref={ref}
      >
        <span style={coloring ? { color } : {}}>
          {maxLen ? summarizeLongStr(text, maxLen, "middle") : text}
        </span>
        {typeof count === "number" && <span>{count.toLocaleString()}</span>}
      </ResultDiv>
    );
  }
);

type ResultValue<T> = [T, number];

interface ResultsProps<T> {
  results: ResultValue<T>[];
  highlight: string;
  onSelect: (value: T) => void;
  active: string | null;
  alignRight?: boolean;
  color: string;
}

const Results = <T extends unknown>({
  color,
  onSelect,
  results,
  highlight,
  active = undefined,
}: ResultsProps<T>) => {
  return (
    <ScrollResultsContainer>
      {results.map((result) => (
        <Result
          key={String(result[0])}
          result={result}
          highlight={highlight}
          onClick={() => onSelect(result[0])}
          active={active === result[0]}
          maxLen={26 - result[1].toLocaleString().length}
          color={color}
        />
      ))}
    </ScrollResultsContainer>
  );
};

export default Results;
