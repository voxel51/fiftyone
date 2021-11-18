import React, {
  MutableRefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  RecoilState,
  RecoilValue,
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import styled from "styled-components";
import { v4 as uuid } from "uuid";

import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import Checkbox from "../Common/Checkbox";
import Input from "../Common/Input";
import Results, { ResultsContainer } from "../Common/Results";
import { Button } from "../utils";
import { PopoutSectionTitle } from "../utils";
import { LIST_LIMIT } from "./stringState";
import { ItemAction } from "../Actions/ItemAction";
import socket from "../../shared/connection";
import { packageMessage } from "../../utils/socket";
import { useTheme } from "../../utils/hooks";
import { genSort } from "../../utils/generic";
import ExcludeOption from "./Exclude";

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

const nullSort = <T extends unknown>({
  count,
  asc,
}: atoms.SortResults): ((
  aa: [T, number | null],
  bb: [T, number | null]
) => number) => {
  return (aa, bb): number => {
    let a = [...aa];
    let b = [...bb];

    if (count) {
      a.reverse();
      b.reverse();
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result = genSort(a[i], b[i], asc);
      if (result !== 0) {
        return result;
      }
    }

    return result;
  };
};

interface WrapperProps<T> {
  results: [T, number][];
  selectedValuesAtom?: RecoilState<T[]>;
  excludeAtom?: RecoilState<boolean>;
  color: string;
  totalCount: number;
  modal: boolean;
  path: string;
  selectedCounts: MutableRefObject<Map<T, number>>;
}

const Wrapper = <T extends unknown>({
  color,
  results,
  totalCount,
  selectedValuesAtom,
  excludeAtom,
  modal,
  path,
  selectedCounts,
}: WrapperProps<T>) => {
  const name = path.split(".").slice(-1)[0];
  const [selected, setSelected] = selectedValuesAtom
    ? useRecoilState(selectedValuesAtom)
    : [[], null];
  const selectedSet = new Set(selected);
  const setExcluded = excludeAtom ? useSetRecoilState(excludeAtom) : null;
  const sorting = useRecoilValue(atoms.sortFilterResults(modal));
  const counts = Object.fromEntries(results);
  let allValues: [T, number][] = selected.map<[T, number]>((value) => [
    value,
    counts[String(value)] ?? 0,
  ]);

  if (totalCount <= CHECKBOX_LIMIT) {
    allValues = [...allValues, ...results.filter(([v]) => !selectedSet.has(v))];
  }

  if (totalCount === 0) {
    return (
      <>
        <Checkbox
          key={"No results"}
          color={color}
          value={false}
          disabled={true}
          name={"No results"}
          setValue={() => {}}
        />
      </>
    );
  }

  allValues = [...new Set(allValues)];

  return (
    <>
      {allValues.sort(nullSort(sorting)).map(([value, count]) => (
        <Checkbox
          key={String(value)}
          color={color}
          value={selectedSet.has(value)}
          disabled={modal && allValues.length === 1}
          name={value}
          count={
            selectedCounts.current.has(value)
              ? selectedCounts.current.get(value)
              : count
          }
          subCountAtom={subCountValueAtom({ path, modal, value })}
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
          {totalCount > 3 && excludeAtom && (
            <ExcludeOption
              excludeAtom={excludeAtom}
              valueName={name}
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

const useOnSelect = <T extends unknown>(
  selectedAtom: RecoilState<T[]>,
  selectedCounts: MutableRefObject<Map<T, number>>,
  callbacks
) => {
  return useRecoilCallback(
    ({ snapshot, set }) => async (value: T, number: number) => {
      const selected = new Set(await snapshot.getPromise(selectedAtom));
      selectedCounts.current.set(value, number);
      selected.add(value);
      set(selectedAtom, [...selected].sort());
      callbacks.forEach((callback) => callback());
    }
  );
};

interface ResultsWrapperProps<T> {
  results: [T, number][];
  color: string;
  shown: boolean;
  onSelect: (value: T) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  subCount: number;
  active: string | null;
}

const ResultsWrapper = <T extends unknown>({
  results,
  color,
  shown,
  onSelect,
  onMouseEnter,
  onMouseLeave,
  subCount,
  active,
}: ResultsWrapperProps<T>) => {
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

const useSearch = <T extends unknown>() => {
  const currentPromise = useRef<
    Promise<{
      count: number;
      results: [T, number][];
    }>
  >();
  return useRecoilCallback(
    ({ snapshot }) => async ({
      modal,
      path,
      search,
      selectedValuesAtom,
      setSearchResults,
      setSubCount,
      setActive,
      noneCount,
    }: {
      modal: boolean;
      search: string;
      path: string;
      selectedValuesAtom: RecoilState<T[]>;
      setSearchResults: (value) => void;
      setSubCount: (value) => void;
      setActive: (value) => void;
      noneCount: number;
    }) => {
      const id = uuid();

      const clear = setTimeout(() => setSearchResults(null), 200);
      const wrap = (handler) => ({ data }) => {
        data = JSON.parse(data);
        data.uuid === id && handler(data);
      };
      const sorting = await snapshot.getPromise(atoms.sortFilterResults(modal));
      let sampleId = null;
      if (modal) {
        sampleId = (await snapshot.getPromise(atoms.modal)).sample._id;
      }
      const selected = await snapshot.getPromise(selectedValuesAtom);

      const promise = new Promise<{
        count: number;
        results: [T, number][];
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
        if (noneCount > 0) {
          results = [...results, [null, noneCount]];
        }
        results.length && setActive(results[0][0]);
        setSearchResults(results);
        setSubCount(count);
      });
    },
    []
  );
};

interface Props<T> {
  selectedValuesAtom: RecoilState<T[]>;
  excludeAtom?: RecoilState<boolean>;
  countsAtom: RecoilValue<{
    count: number;
    results: [T, number][];
  }>;
  modal: boolean;
  path: string;
  named?: boolean;
}

const CategoricalFilter = <T extends unknown>({
  countsAtom,
  selectedValuesAtom,
  excludeAtom,
  path,
  modal,
  named,
}: Props<T>) => {
  const name = path.split(".").slice(-1)[0];
  const color = useRecoilValue(selectors.colorMap(modal))(path);
  const selected = useRecoilValue(selectedValuesAtom);
  const { count, results } = useRecoilValue(countsAtom);
  const [focused, setFocused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(undefined);
  const [subCount, setSubCount] = useState(null);
  const [searchResults, setSearchResults] = useState<[T, number][]>(null);

  const selectedCounts = useRef(new Map<T, number>());

  const onSelect = useOnSelect(selectedValuesAtom, selectedCounts, [
    () => setSearchResults(null),
    () => setSearch(""),
    () => setActive(undefined),
  ]);

  const none = results.filter(([v, c]) => v === null);
  const noneCount = none.length ? none[0][1] : 0;
  const runSearch = useSearch<T>();

  useLayoutEffect(() => {
    focused &&
      runSearch({
        modal,
        path,
        search,
        selectedValuesAtom,
        setSearchResults,
        setSubCount,
        setActive,
        noneCount,
      });
  }, [focused, search, selected, noneCount]);

  const getCount = (results, search) => {
    const index = results.map((r) => r[0]).indexOf(search);
    return results[index][1];
  };

  return (
    <NamedCategoricalFilterContainer>
      <NamedCategoricalFilterHeader>
        {named && name && <>{name}</>}
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
                  const index = searchResults.map((r) => r[0]).indexOf(active);
                  if (index > 0) {
                    setActive(searchResults[index - 1][0]);
                  }
                }
              }}
              onEnter={() => {
                if (active !== undefined) {
                  onSelect(active, getCount(searchResults, active));
                }
                if (
                  results &&
                  results
                    .map(([v]) => (v === null ? "None" : String(v)))
                    .includes(search)
                ) {
                  onSelect(search, getCount(searchResults, active));
                }
              }}
              placeholder={
                results === null ? "Loading..." : `+ filter by ${name}`
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
                onSelect(value, getCount(searchResults, value));
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
          path={path}
          color={color}
          results={results}
          selectedValuesAtom={selectedValuesAtom}
          excludeAtom={excludeAtom}
          modal={modal}
          totalCount={count}
          selectedCounts={selectedCounts}
        />
      </CategoricalFilterContainer>
    </NamedCategoricalFilterContainer>
  );
};

export default CategoricalFilter;
