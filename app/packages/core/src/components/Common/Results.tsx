import React, { useEffect, useRef } from "react";
import { animated } from "@react-spring/web";
import styled from "styled-components";

import { useHighlightHover } from "../Actions/utils";
import { getValueString } from "../Filters/utils";
import { NameAndCountContainer } from "../utils";

export const ResultsContainer = styled(animated.div)`
  background-color: ${({ theme }) => theme.background.level2};
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};
  border-radius: 2px;
  box-shadow: 0 2px 20px ${({ theme }) => theme.custom.shadow};
  box-sizing: border-box;
  position: absolute;
  width: auto;
  z-index: 801;
  padding: 0 0.5rem;
  width: 100%;
`;

const ResultContainer = animated(NameAndCountContainer);

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

type ResultValue<T> = [T, number];

interface ResultProps<T> {
  result: T;
  count: number;
  highlight: string;
  active: boolean | null;
  onClick: () => void;
  color: string;
}

const Result = <T extends unknown>({
  active,
  highlight,
  onClick,
  color,
  result,
  count,
}: ResultProps<T>) => {
  const props = useHighlightHover(
    false,
    active ? active : null,
    result === null ? highlight : null
  );
  const ref = useRef<HTMLDivElement>();
  const wasActive = useRef(false);

  const [text, coloring] = getValueString(result);

  useEffect(() => {
    if (active && ref.current && !wasActive.current) {
      wasActive.current = true;
    } else if (!active) {
      wasActive.current = false;
    }

    active && ref.current.scrollIntoView();
  }, [active]);

  return (
    <ResultContainer
      title={result === null ? "None" : result}
      {...props}
      onClick={onClick}
      ref={ref}
    >
      <span style={coloring ? { color } : {}}>{text}</span>
      {typeof count === "number" && <span>{count.toLocaleString()}</span>}
    </ResultContainer>
  );
};

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
        <Result<T>
          key={String(result[0])}
          result={result[0]}
          count={result[1]}
          highlight={highlight}
          onClick={() => onSelect(result[0])}
          active={active === result[0]}
          color={color}
        />
      ))}
    </ScrollResultsContainer>
  );
};

export default Results;
