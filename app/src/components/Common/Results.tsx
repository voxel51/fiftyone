import React from "react";

import { ItemAction, useHighlightHover } from "../Actions/utils";

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
