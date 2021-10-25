import React, {
  MutableRefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
import * as selectors from "../../recoil/selectors";
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
import { subCountValueAtom } from "./atoms";
import { genSort } from "../../utils/generic";
import { FRAME_SUPPORT_FIELD } from "../../utils/labels";

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

type Value = string | number | null | boolean | [number, number];

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
    for (let i = 0; i < a.length; i++) {
      result = genSort(a[i], b[i], asc);
      if (result !== 0) {
        return result;
      }
    }

    return result;
  };
};

interface WrapperProps {
  results: [Value, number][];
  selectedValuesAtom?: RecoilState<Value[]>;
  excludeAtom?: RecoilState<boolean>;
  name: string;
  valueName: string;
  color: string;
  totalCount: number;
  modal: boolean;
  path: string;
  disableItems?: boolean;
  selectedCounts: MutableRefObject<Map<Value, number>>;
}

const Wrapper = ({
  color,
  results,
  totalCount,
  selectedValuesAtom,
  excludeAtom,
  valueName,
  modal,
  path,
  disableItems,
  selectedCounts,
}: WrapperProps) => {
  const [selected, setSelected] = selectedValuesAtom
    ? useRecoilState(selectedValuesAtom)
    : [[], null];
  const selectedSet = new Set(selected);
  const setExcluded = excludeAtom ? useSetRecoilState(excludeAtom) : null;
  const sorting = useRecoilValue(atoms.sortFilterResults(modal));
  const counts = Object.fromEntries(results);
  let allValues: [Value, number][] = selected.map<[Value, number]>((value) => [
    value,
    counts[String(value)] ?? 0,
  ]);
  const disableCount =
    modal &&
    useRecoilValue(selectors.primitivesSubfieldMap("sample"))[path] ===
      FRAME_SUPPORT_FIELD;

  if (totalCount <= CHECKBOX_LIMIT || disableItems) {
    allValues = [
      ...allValues,
      ...results.filter(([v]) => disableItems || !selectedSet.has(v)),
    ];
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
          disabled={(modal && allValues.length === 1) || disableItems}
          name={value}
          count={
            disableCount
              ? null
              : selectedCounts.current.has(value)
              ? selectedCounts.current.get(value)
              : count
          }
          subCountAtom={subCountValueAtom({ path, modal, value })}
          setValue={(checked: boolean) => {
            if (disableItems) {
              return;
            }
            if (checked) {
              selectedSet.add(value);
            } else {
              selectedSet.delete(value);
            }
            setSelected([...selectedSet].sort());
          }}
        />
      ))}
      {Boolean(selectedSet.size) && !disableItems && (
        <>
          <PopoutSectionTitle />
          {totalCount > 3 && excludeAtom && (
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

const useOnSelect = (
  selectedAtom: RecoilState<Value[]>,
  selectedCounts: MutableRefObject<Map<Value, number>>,
  callbacks
) => {
  return useRecoilCallback(
    ({ snapshot, set }) => async (value: Value, number: number) => {
      const selected = new Set(await snapshot.getPromise(selectedAtom));
      selectedCounts.current.set(value, number);
      selected.add(value);
      set(selectedAtom, [...selected].sort());
      callbacks.forEach((callback) => callback());
    }
  );
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

const useSearch = () => {
  const currentPromise = useRef<
    Promise<{
      count: number;
      results: [string, number][];
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
      selectedValuesAtom: RecoilState<Value[]>;
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
        sampleId = (await snapshot.getPromise(atoms.modal)).sampleId;
      }
      const selected = await snapshot.getPromise(selectedValuesAtom);

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

interface Props {
  countsAtom: RecoilValueReadOnly<{
    count: number;
    results: [Value, number][];
  }>;
  selectedValuesAtom?: RecoilState<Value[]>;
  excludeAtom?: RecoilState<boolean>;
  name?: string;
  valueName: string;
  color: string;
  path: string;
  modal: boolean;
  disableItems?: boolean;
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
        disableItems,
      }: Props,
      ref
    ) => {
      const selected = selectedValuesAtom
        ? useRecoilValue(selectedValuesAtom)
        : [null, null];
      const { count, results } = useRecoilValue(countsAtom);
      const [focused, setFocused] = useState(false);
      const [hovering, setHovering] = useState(false);
      const [search, setSearch] = useState("");
      const [active, setActive] = useState(undefined);
      const [subCount, setSubCount] = useState(null);
      const [searchResults, setSearchResults] = useState<[string, number][]>(
        null
      );

      const selectedCounts = useRef(new Map<Value, number>());

      const onSelect = useOnSelect(selectedValuesAtom, selectedCounts, [
        () => setSearchResults(null),
        () => setSearch(""),
        () => setActive(undefined),
      ]);

      const none = results.filter(([v, c]) => v === null);
      const noneCount = none.length ? none[0][1] : 0;
      const runSearch = useSearch();

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
        <NamedCategoricalFilterContainer ref={ref}>
          <NamedCategoricalFilterHeader>
            {name && <>{name}</>}
          </NamedCategoricalFilterHeader>
          <CategoricalFilterContainer>
            {count > CHECKBOX_LIMIT && !disableItems && (
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
                      onSelect(active, getCount(searchResults, active));
                    }
                    if (results && results.map(([v]) => v).includes(search)) {
                      onSelect(search, getCount(searchResults, active));
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
              name={name}
              results={results}
              selectedValuesAtom={selectedValuesAtom}
              excludeAtom={excludeAtom}
              valueName={valueName}
              modal={modal}
              totalCount={count}
              disableItems={disableItems}
              selectedCounts={selectedCounts}
            />
          </CategoricalFilterContainer>
        </NamedCategoricalFilterContainer>
      );
    }
  )
);

export default CategoricalFilter;
