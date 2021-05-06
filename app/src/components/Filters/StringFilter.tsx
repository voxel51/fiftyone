import React, { Suspense, useLayoutEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import {
  RecoilState,
  RecoilValueReadOnly,
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import styled from "styled-components";
import uuid from "uuid-v4";

import Checkbox from "../Common/Checkbox";
import Input from "../Common/Input";
import Results, { ResultsContainer } from "../Common/Results";
import { Button } from "../FieldsSidebar";
import { PopoutSectionTitle, TabOption } from "../utils";
import { LIST_LIMIT } from "./StringFieldFilter";
import { ItemAction } from "../Actions/utils";
import socket from "../../shared/connection";
import { packageMessage } from "../../utils/socket";
import { useTheme } from "../../utils/hooks";

const StringFilterContainer = styled.div`
  background: ${({ theme }) => theme.backgroundDark};
  border: 1px solid #191c1f;
  border-radius: 2px;
  color: ${({ theme }) => theme.fontDark};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem 0 0.5rem;
`;

const NamedStringFilterContainer = styled.div`
  padding-bottom: 0.5rem;
  margin: 3px;
  font-weight: bold;
`;

const NamedStringFilterHeader = styled.div`
  display: flex;
  justify-content: space-between;
`;

const CHECKBOX_LIMIT = 15;

interface ExcludeOptionProps {
  excludeAtom: RecoilState<boolean>;
  valueName: string;
  color: string;
}

const ExcludeOption = ({
  excludeAtom,
  valueName,
  color,
}: ExcludeOptionProps) => {
  const [excluded, setExcluded] = useRecoilState(excludeAtom);
  return (
    <TabOption
      active={excluded ? "Exclude" : "Select"}
      color={color}
      options={[
        {
          text: "Select",
          title: `Select ${valueName}`,
          onClick: () => excluded && setExcluded(false),
        },
        {
          text: "Exclude",
          title: `Exclude ${valueName}`,
          onClick: () => !excluded && setExcluded(true),
        },
      ]}
    />
  );
};

interface WrapperProps {
  results: string[];
  selectedValuesAtom: RecoilState<string[]>;
  excludeAtom: RecoilState<boolean>;
  name: string;
  valueName: string;
  color: string;
  count: number;
}

const Wrapper = ({
  color,
  results,
  count,
  selectedValuesAtom,
  excludeAtom,
  valueName,
}: WrapperProps) => {
  const [selected, setSelected] = useRecoilState(selectedValuesAtom);
  const selectedSet = new Set(selected);
  const setExcluded = useSetRecoilState(excludeAtom);

  let allValues = selected;

  if (count <= CHECKBOX_LIMIT) {
    allValues = [...allValues, ...results];
  }

  return (
    <>
      {[...new Set(allValues)].sort().map((value) => (
        <Checkbox
          key={value}
          color={color}
          value={selectedSet.has(value)}
          name={value}
          maxLen={31}
          setValue={(checked: boolean) => {
            if (checked) {
              selectedSet.add(value);
            } else {
              selectedSet.delete(value);
            }
            setSelected([...selectedSet].sort());
          }}
        />
      ))}
      {Boolean(selectedSet.size) && (
        <>
          <PopoutSectionTitle />
          {count > 3 && (
            <ExcludeOption
              excludeAtom={excludeAtom}
              valueName={valueName}
              color={color}
            />
          )}
          <Button
            text={"Reset"}
            color={color}
            onClick={() => {
              setSelected([]);
              setExcluded(false);
            }}
            style={{
              margin: "0.25rem -0.5rem",
              height: "2rem",
              borderRadius: 0,
              textAlign: "center",
            }}
          ></Button>
        </>
      )}
    </>
  );
};

const useOnSelect = (selectedAtom: RecoilState<string[]>, callbacks) => {
  return useRecoilCallback(({ snapshot, set }) => async (value: string) => {
    const selected = new Set(await snapshot.getPromise(selectedAtom));
    selected.add(value);
    set(selectedAtom, [...selected].sort());
    callbacks.forEach((callback) => callback());
  });
};

interface ResultsWrapperProps {
  results: string[];
  color: string;
  shown: boolean;
  onSelect: (value: string) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  subCount: number;
  alignRight?: boolean;
  active: string | null;
}

const ResultsWrapper = ({
  results,
  color,
  shown,
  onSelect,
  onMouseEnter,
  onMouseLeave,
  subCount,
  active,
  alignRight,
}: ResultsWrapperProps) => {
  const theme = useTheme();
  return (
    <>
      {shown && results && (
        <ResultsContainer
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        >
          {results && (
            <Results
              active={active}
              onSelect={onSelect}
              results={results}
              highlight={color}
              alignRight={alignRight}
            />
          )}
          <PopoutSectionTitle />
          <ItemAction
            style={{
              cursor: "default",
              textAlign: "right",
              color: theme.font,
            }}
          >
            {results && subCount > results.length && (
              <>
                {results.length} of {subCount.toLocaleString()} results
              </>
            )}
            {results && results.length === 0 && <>No results</>}
          </ItemAction>
        </ResultsContainer>
      )}
    </>
  );
};

interface Props {
  totalAtom: RecoilValueReadOnly<{
    count: number;
    results: string[];
  }>;
  selectedValuesAtom: RecoilState<string[]>;
  excludeAtom: RecoilState<boolean>;
  hasNoneAtom: RecoilValueReadOnly<boolean>;
  name?: string;
  valueName: string;
  color: string;
  path: string;
}

const StringFilter = React.memo(
  React.forwardRef(
    (
      {
        name,
        valueName,
        color,
        selectedValuesAtom,
        excludeAtom,
        totalAtom,
        hasNoneAtom,
        path,
      }: Props,
      ref
    ) => {
      const selected = useRecoilValue(selectedValuesAtom);
      const { count, results } = useRecoilValue(totalAtom);
      const hasNone = useRecoilValue(hasNoneAtom);
      const [focused, setFocused] = useState(false);
      const [hovering, setHovering] = useState(false);
      const [search, setSearch] = useState("");
      const [active, setActive] = useState(undefined);
      const [subCount, setSubCount] = useState(null);
      const [searchResults, setSearchResults] = useState<string[]>(null);
      const currentPromise = useRef<
        Promise<{
          count: number;
          results: string[];
        }>
      >();

      const onSelect = useOnSelect(selectedValuesAtom, [
        () => setSearchResults(null),
        () => setSearch(""),
        () => setActive(undefined),
      ]);

      useLayoutEffect(() => {
        const id = uuid();

        const clear = setTimeout(() => setSearchResults(null), 200);
        const wrap = (handler) => ({ data }) => {
          data = JSON.parse(data);
          data.type === id && handler(data);
        };
        if (focused) {
          const promise = new Promise<{
            count: number;
            results: string[];
          }>((resolve) => {
            const listener = wrap(({ count, results }) => {
              socket.removeEventListener("message", listener);
              resolve({ count, results });
            });
            socket.addEventListener("message", listener);
            socket.send(
              packageMessage("distinct", {
                path,
                search,
                selected,
                limit: LIST_LIMIT,
                uuid: id,
              })
            );
          });
          currentPromise.current = promise;
          promise.then(({ count, results }) => {
            clearTimeout(clear);
            if (currentPromise.current !== promise) {
              return;
            }
            if (hasNone) {
              results.push(null);
              count++;
              results.sort();
            }
            setSearchResults(results);
            setSubCount(count);
          });
        }
      }, [focused, search, selected]);

      return (
        <NamedStringFilterContainer ref={ref}>
          <NamedStringFilterHeader>
            {name && <>{name}</>}
          </NamedStringFilterHeader>
          <StringFilterContainer>
            {count > CHECKBOX_LIMIT && (
              <>
                <Input
                  key={"input"}
                  color={color}
                  setter={(v) => {
                    setSearch(v);
                    setActive(undefined);
                  }}
                  value={search}
                  onKeyDown={(event) => {
                    if (searchResults === null) {
                      return;
                    } else if (event.key === "ArrowDown") {
                      if (active === undefined) {
                        setActive(searchResults[0]);
                      } else {
                        const index = searchResults.indexOf(active);
                        if (index < searchResults.length - 1) {
                          setActive(searchResults[index + 1]);
                        }
                      }
                    } else if (event.key === "ArrowUp") {
                      const index = searchResults.indexOf(active);
                      if (index > 0) {
                        setActive(searchResults[index - 1]);
                      }
                    }
                  }}
                  onEnter={() => {
                    if (active !== undefined) {
                      onSelect(active);
                    }
                    if (results && results.includes(search)) {
                      onSelect(search);
                    }
                  }}
                  placeholder={
                    results === null ? "Loading..." : `+ filter by ${valueName}`
                  }
                  onFocus={() => setFocused(true)}
                  onBlur={() => !hovering && setFocused(false)}
                />
                <ResultsWrapper
                  key={"results"}
                  results={searchResults}
                  color={color}
                  shown={focused || hovering}
                  onSelect={(value) => {
                    onSelect(value);
                    setHovering(false);
                    setFocused(false);
                  }}
                  active={active}
                  subCount={subCount}
                  alignRight={path === "filepath"}
                  onMouseEnter={() => setHovering(true)}
                  onMouseLeave={() => setHovering(false)}
                />
              </>
            )}

            <Wrapper
              color={color}
              name={name}
              results={results}
              selectedValuesAtom={selectedValuesAtom}
              excludeAtom={excludeAtom}
              valueName={valueName}
              count={count}
            />
          </StringFilterContainer>
        </NamedStringFilterContainer>
      );
    }
  )
);

export default StringFilter;
