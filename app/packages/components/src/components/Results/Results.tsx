import classNames from "classnames";
import React from "react";

import style from "./Results.module.css";

export interface ResultProps<T> {
  active: boolean;
  result: T;
  onClick: () => void;
  component: React.FC<{ value: T; className?: string }>;
}

const NONSTRING_VALUES: any[] = [false, true, null];
const STRING_VALUES = ["False", "True", "None"];

export const getValueString = (value: unknown): [string, boolean] => {
  if (NONSTRING_VALUES.includes(value)) {
    return [STRING_VALUES[NONSTRING_VALUES.indexOf(value)], true];
  }

  if (typeof value === "number") {
    return [value.toLocaleString(), true];
  }

  if (typeof value === "string" && !value.length) {
    return [`""`, true];
  }

  if (Array.isArray(value)) {
    return [`[${value.map((v) => getValueString(v)[0]).join(", ")}]`, false];
  }

  return [value as string, false];
};

export const Result = <T extends unknown>({
  active,
  result,
  onClick,
  component,
}: ResultProps<T>) => {
  const Component = component;

  const classes = active ? [style.active, style.result] : [style.result];

  return (
    <div
      data-cy={`selector-result-${result}`}
      onClick={onClick}
      className={classNames(...classes)}
    >
      <Component value={result} />
    </div>
  );
};

export interface ResultsProps<T> {
  active?: number;
  results: T[];
  onSelect: (value: T) => void;
  total?: number;
  component: React.FC<{ value: T; className: string }>;
  toKey: (value: T) => string;
}

const Results = <T extends unknown>({
  active,
  onSelect,
  results,
  total,
  component,
  toKey = (value: T) => String(value),
}: ResultsProps<T>) => {
  return (
    <div className={style.container}>
      <div
        className={style.scrollContainer}
        style={{ paddingBottom: total === undefined ? 0 : 26.5 }}
        data-cy="selector-results-container"
      >
        {results.map((result, i) => (
          <Result
            active={i === active}
            component={component}
            key={toKey(result)}
            result={result}
            onClick={() => onSelect(result)}
          />
        ))}
      </div>
      {total !== undefined && (
        <div className={style.footer}>
          {Boolean(total) && (
            <>
              {results.length} of {total.toLocaleString()}
            </>
          )}
          {!Boolean(total) && <>No results</>}
        </div>
      )}
    </div>
  );
};

export default Results;
