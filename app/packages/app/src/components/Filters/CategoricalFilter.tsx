import React, { useLayoutEffect, useRef, useState } from "react";
import {
  RecoilState,
  RecoilValueReadOnly,
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import styled from "styled-components";
import { v4 as uuid } from "uuid";

import * as atoms from "../../recoil/atoms";
import Checkbox from "../Common/Checkbox";
import Input from "../Common/Input";
import Results, { ResultsContainer } from "../Common/Results";
import { Button } from "../FieldsSidebar";
import { PopoutSectionTitle, TabOption } from "../utils";
import { LIST_LIMIT } from "./StringFieldFilter.state";
import { ItemAction } from "../Actions/ItemAction";
import socket from "../../shared/connection";
import { packageMessage } from "../../utils/socket";
import { useTheme } from "../../utils/hooks";
import { Value } from "./types";

const CategoricalFilterContainer = styled.div`
  background: ${({ theme }) => theme.backgroundDark};
  border: 1px solid #191c1f;
  border-radius: 2px;
  color: ${({ theme }) => theme.fontDark};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem;
`;

const NamedCategoricalFilterContainer = styled.div`
  padding-bottom: 0.5rem;
  margin: 3px;
  font-weight: bold;
`;

const NamedCategoricalFilterHeader = styled.div`
  display: flex;
  justify-content: space-between;
`;

const CHECKBOX_LIMIT = 20;

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

const genSort = (a, b, asc) => {
  if (a === b) {
    return 0;
  }

  if (a === null) {
    return 1;
  }

  if (b === null) {
    return -1;
  }

  if (a > b) {
    return asc ? 1 : -1;
  }

  return asc ? -1 : 1;
};

const nullSort = ({
  count,
  asc,
}: atoms.SortResults): ((
  aa: [Value, number | null],
  bb: [Value, number | null]
) => number) => {
  return (aa, bb): number => {
    let a = [...aa];
    let b = [...bb];

    if (count) {
      a.reverse();
      b.reverse();
    }

    let result = 0;
    a.forEach((ai, i) => {
      result = genSort(ai, b[i], asc);
      if (result !== 0) {
        return result;
      }
    });

    return result;
  };
};

interface WrapperProps {
  results: [Value, [number, number]][];
  selectedValuesAtom: RecoilState<Value[]>;
  excludeAtom?: RecoilState<boolean>;
  name: string;
  valueName: string;
  color: string;
  count: number;
  modal: boolean;
}

const Wrapper = ({
  color,
  results,
  count,
  selectedValuesAtom,
  excludeAtom,
  valueName,
  modal,
}: WrapperProps) => {
  const [selected, setSelected] = useRecoilState(selectedValuesAtom);
  const selectedSet = new Set(selected);
  const setExcluded = excludeAtom ? useSetRecoilState(excludeAtom) : null;
  const sorting = useRecoilValue(atoms.sortFilterResults(modal));
  const counts = Object.fromEntries(results);
  let allValues: [string, number][] = selected.map<[string, number]>(
    (value) => [value, counts[value] ?? 0]
  );

  if (count <= CHECKBOX_LIMIT) {
    allValues = [...allValues, ...results.filter(([v]) => !selectedSet.has(v))];
  }

  return (
    <>
      {[...new Set(allValues)].sort(nullSort(sorting)).map(([value, count]) => (
        <Checkbox
          key={String(value)}
          color={color}
          value={selectedSet.has(value)}
          name={value}
          count={count}
          subCountAtom={null}
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
          {count > 3 && excludeAtom && (
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

const useOnSelect = (selectedAtom: RecoilState<Value[]>, callbacks) => {
  return useRecoilCallback(({ snapshot, set }) => async (value: Value) => {
    const selected = new Set(await snapshot.getPromise(selectedAtom));
    selected.add(value);
    set(selectedAtom, [...selected].sort());
    callbacks.forEach((callback) => callback());
  });
};

interface ResultsWrapperProps {
  results: [Value, number][];
  color: string;
  shown: boolean;
  onSelect: (value: Value) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  subCount: number;
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
              color={color}
              active={active}
              onSelect={onSelect}
              results={results}
              highlight={color}
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
            {results && subCount !== null && results.length > 0 && (
              <>
                {results.length !== subCount && <>{results.length} of</>}
                {subCount.toLocaleString()} results
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
  countsAtom: RecoilValueReadOnly<{
    count: number;
    results: [Value, number][];
  }>;
  selectedValuesAtom: RecoilState<Value[]>;
  excludeAtom?: RecoilState<boolean>;
  name?: string;
  valueName: string;
  color: string;
  path: string;
  modal: boolean;
}

const CategoricalFilter = React.memo(
  React.forwardRef(
    (
      {
        name,
        valueName,
        color,
        selectedValuesAtom,
        excludeAtom,
        countsAtom,
        path,
        modal,
      }: Props,
      ref
    ) => {
      const selected = useRecoilValue(selectedValuesAtom);
      const { count, results } = useRecoilValue(countsAtom);
      const [focused, setFocused] = useState(false);
      const [hovering, setHovering] = useState(false);
      const [search, setSearch] = useState("");
      const [active, setActive] = useState(undefined);
      const [subCount, setSubCount] = useState(null);
      const sorting = useRecoilValue(atoms.sortFilterResults(modal));
      const [searchResults, setSearchResults] = useState<[string, number][]>(
        null
      );
      const sampleId = modal ? useRecoilValue(atoms.modal).sampleId : null;

      const currentPromise = useRef<
        Promise<{
          count: number;
          results: [string, number][];
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
          data.uuid === id && handler(data);
        };
        if (focused) {
          const promise = new Promise<{
            count: number;
            results: [string, number][];
          }>((resolve) => {
            const listener = wrap(({ count, results }) => {
              socket.removeEventListener("message", listener);
              resolve({ count, results });
            });
            socket.addEventListener("message", listener);
            socket.send(
              packageMessage("count_values", {
                path,
                search,
                selected,
                limit: LIST_LIMIT,
                uuid: id,
                sample_id: sampleId,
                ...sorting,
              })
            );
          });
          currentPromise.current = promise;
          promise.then(({ count, results }) => {
            clearTimeout(clear);
            if (currentPromise.current !== promise) {
              return;
            }
            results.length && setActive(results[0][0]);
            setSearchResults(results);
            setSubCount(count);
          });
        }
      }, [focused, search, selected]);

      return (
        <NamedCategoricalFilterContainer ref={ref}>
          <NamedCategoricalFilterHeader>
            {name && <>{name}</>}
          </NamedCategoricalFilterHeader>
          <CategoricalFilterContainer>
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
                        const index = searchResults
                          .map((r) => r[0])
                          .indexOf(active);
                        if (index < searchResults.length - 1) {
                          setActive(searchResults[index + 1][0]);
                        }
                      }
                    } else if (event.key === "ArrowUp") {
                      const index = searchResults
                        .map((r) => r[0])
                        .indexOf(active);
                      if (index > 0) {
                        setActive(searchResults[index - 1][0]);
                      }
                    }
                  }}
                  onEnter={() => {
                    if (active !== undefined) {
                      onSelect(active);
                    }
                    if (results && results.map(([v]) => v).includes(search)) {
                      onSelect(search);
                    }
                  }}
                  placeholder={
                    results === null ? "Loading..." : `+ filter by ${valueName}`
                  }
                  onFocus={() => {
                    results.length && setActive(results[0][0]);
                    setFocused(true);
                  }}
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
              modal={modal}
              count={count}
            />
          </CategoricalFilterContainer>
        </NamedCategoricalFilterContainer>
      );
    }
  )
);

export default CategoricalFilter;
