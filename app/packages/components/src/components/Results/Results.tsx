import classNames from "classnames";
import React, { useEffect, useLayoutEffect, useRef } from "react";
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

export function Result<T>({
  active,
  result,
  onClick,
  component,
}: ResultProps<T>) {
  const Component = component;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const elem = ref.current;
    if (active && elem) {
      elem.scrollIntoView({ block: "center" });
    }
  }, [active]);

  const classes = active ? [style.active, style.result] : [style.result];

  return (
    <div
      data-cy={`selector-result-${result}`}
      onClick={onClick}
      className={classNames(...classes)}
      ref={ref}
    >
      <Component value={result} />
    </div>
  );
}

export interface ResultsProps<T> {
  active?: number;
  component: React.FC<{ value: T; className?: string }>;
  cy?: string;
  footer?: React.JSX.Element;
  onSelect: (value: T) => void;
  results?: T[];
  toKey?: (value: T) => string;
  total?: number;
}

function Results<T>({
  active,
  cy,
  component,
  footer,
  onSelect,
  results,
  toKey = (value: T) => String(value),
  total,
}: ResultsProps<T>) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    ref.current?.dispatchEvent(
      new CustomEvent(`selector-results-${cy}`, { bubbles: true })
    );
  }, [cy, ref]);

  const hasFooter =
    footer ||
    (!!total && !!results?.length) ||
    (!!results && !results.length) ||
    !results;

  return (
    <div
      className={style.container}
      style={hasFooter ? { paddingBottom: 26.5 } : {}}
    >
      <div
        className={style.scrollContainer}
        data-cy={`selector-results-container${cy ? `-${cy}` : ""}`}
        ref={ref}
      >
        {!!results &&
          results.map((result, i) => {
            return (
              <Result
                active={i === active}
                component={component}
                key={toKey ? toKey(result) : String(result)}
                result={result}
                onClick={() => onSelect(result)}
              />
            );
          })}
      </div>
      <div className={style.footer}>
        <Footer footer={footer} results={results} total={total} />
      </div>
    </div>
  );
}

function Footer<T>({
  footer,
  results,
  total,
}: {
  footer?: React.JSX.Element;
  results?: T[];
  total?: number;
}) {
  if (footer) {
    return footer;
  }

  if (!!total && !!results?.length) {
    return (
      <>
        {results.length} of {total.toLocaleString()}
      </>
    );
  }

  if (!!results && !results.length) {
    return <>No results</>;
  }

  if (!results) {
    return <div>Too many results</div>;
  }

  return null;
}

export default Results;
