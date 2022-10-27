import React, { MutableRefObject, useEffect, useRef } from "react";
import {
  atomFamily,
  RecoilState,
  RecoilValue,
  selectorFamily,
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useRecoilValueLoadable,
  useSetRecoilState,
} from "recoil";
import styled from "styled-components";

import { genSort } from "../../utils/generic";

import Checkbox from "../Common/Checkbox";
import { Button } from "../utils";

import ExcludeOption from "./Exclude";
import { getFetchFunction, VALID_KEYPOINTS } from "@fiftyone/utilities";
import { Selector, useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";

const CategoricalFilterContainer = styled.div`
  background: ${({ theme }) => theme.background.level2};
  border: 1px solid var(--joy-palette-divider);
  border-radius: 2px;
  color: ${({ theme }) => theme.text.secondary};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem;
  position: relative;
`;

const NamedCategoricalFilterContainer = styled.div`
  margin: 3px;
  font-weight: bold;
`;

const NamedCategoricalFilterHeader = styled.div`
  display: flex;
  justify-content: space-between;
  text-overflow: ellipsis;
`;

const CHECKBOX_LIMIT = 20;

type V = { value: string | number | null | boolean; count: number };

const nullSort = ({
  count,
  asc,
}: fos.SortResults): ((aa: V, bb: V) => number) => {
  return ({ count: aac, value: aav }, { count: bbc, value: bbv }): number => {
    let a = [aav, aac];
    let b = [bbv, bbc];

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
  results: [V["value"], number][];
  selectedValuesAtom: RecoilState<V["value"][]>;
  excludeAtom?: RecoilState<boolean>;
  color: string;
  totalCount: number;
  modal: boolean;
  path: string;
  selectedCounts: MutableRefObject<Map<V["value"], number>>;
}

const Wrapper = ({
  color,
  results,
  totalCount,
  selectedValuesAtom,
  excludeAtom,
  modal,
  path,
  selectedCounts,
}: WrapperProps) => {
  const name = path.split(".").slice(-1)[0];
  const [selected, setSelected] = useRecoilState(selectedValuesAtom);

  const selectedSet = new Set(selected);
  const setExcluded = excludeAtom ? useSetRecoilState(excludeAtom) : null;
  const sorting = useRecoilValue(fos.sortFilterResults(modal));
  const counts = Object.fromEntries(results);
  let allValues: V[] = selected.map<V>((value) => ({
    value,
    count: counts[String(value)] ?? 0,
  }));
  const skeleton = useRecoilValue(isKeypointLabel(path));

  if (results.length <= CHECKBOX_LIMIT || skeleton) {
    allValues = [
      ...allValues,
      ...results
        .filter(([v]) => !selectedSet.has(v))
        .map(([value, count]) => ({ value, count })),
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
      {allValues.sort(nullSort(sorting)).map(({ value, count }) => (
        <Checkbox
          key={String(value)}
          color={color}
          value={selectedSet.has(value)}
          disabled={totalCount === 1}
          name={value}
          count={
            count < 0
              ? null
              : selectedCounts.current.has(value)
              ? selectedCounts.current.get(value)
              : count
          }
          setValue={(checked: boolean) => {
            if (checked) {
              selectedSet.add(value);
            } else {
              selectedSet.delete(value);
            }
            setSelected([...selectedSet].sort());
          }}
          subcountAtom={fos.count({
            modal,
            path,
            extended: true,
            value: value as string,
          })}
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
              setExcluded && setExcluded(false);
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

const categoricalSearch = atomFamily<string, { path: string; modal: boolean }>({
  key: "categoricalSearchResults",
  default: "",
});

const categoricalSearchResults = selectorFamily<
  {
    values: V[];
    count: number;
  },
  { path: string; modal: boolean }
>({
  key: "categoricalSearchResults",
  get:
    ({ path, modal }) =>
    async ({ get }) => {
      const search = get(categoricalSearch({ modal, path }));
      const sorting = get(fos.sortFilterResults(modal));
      let sampleId = null;
      const selected = get(fos.stringSelectedValuesAtom({ path, modal }));
      if (modal) {
        sampleId = get(fos.modal)?.sample._id;
      }

      const noneCount = get(fos.noneCount({ path, modal, extended: false }));

      const data = await getFetchFunction()("POST", "/values", {
        dataset: get(fos.dataset).name,
        view: get(fos.view),
        path,
        search,
        selected,
        sample_id: sampleId,
        ...sorting,
      });

      let { values, count } = data as { values: V[]; count: number };

      if (noneCount > 0 && "None".includes(search)) {
        values = [...values, { value: null, count: noneCount }]
          .sort(nullSort(sorting))
          .slice(0, 25);
        count++;
      }

      return { count, values };
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

const getUseSearch = ({ modal, path }: { modal: boolean; path: string }) => {
  return (search: string) => {
    const { count, values } = useRecoilValue(
      categoricalSearchResults({ modal, path })
    );

    const setSearch = useSetRecoilState(categoricalSearch({ modal, path }));

    useEffect(() => {
      setSearch(search);
    }, [search]);

    return {
      values,
      total: count,
    };
  };
};

const useOnSelect = (
  selectedAtom: RecoilState<V["value"][]>,
  selectedCounts: MutableRefObject<Map<V["value"], number>>
) => {
  return useRecoilCallback(
    ({ snapshot, set }) =>
      async ({ value, count }: V) => {
        const selected = new Set(await snapshot.getPromise(selectedAtom));
        selectedCounts.current.set(value, count);
        selected.add(value);
        set(selectedAtom, [...selected].sort());
      },
    [selectedAtom, selectedCounts]
  );
};

interface Props<T extends V = V> {
  selectedValuesAtom: RecoilState<T["value"][]>;
  excludeAtom?: RecoilState<boolean>;
  countsAtom: RecoilValue<{
    count: number;
    results: [T["value"], number][];
  }>;
  modal: boolean;
  path: string;
  named?: boolean;
  title: string;
}

const ResultComponent = ({ value: { value, count } }: { value: V }) => {
  return (
    <>
      <span
        style={{
          fontSize: "1rem",
          flex: 1,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: "1rem" }}>{count}</span>
    </>
  );
};

export const isKeypointLabel = selectorFamily<boolean, string>({
  key: "isKeypointLabel",
  get:
    (path) =>
    ({ get }) => {
      const { CountValues } = get(
        fos.aggregations({ modal: false, extended: false })
      )[path] as fos.CategoricalAggregations;

      if (!CountValues) {
        const keys = path.split(".");
        let parent = keys[0];

        let f = get(fos.field(parent));
        if (!f && parent === "frames") {
          parent = `frames.${keys[1]}`;
        }

        if (VALID_KEYPOINTS.includes(get(fos.field(parent)).embeddedDocType)) {
          return true;
        }
      }

      return false;
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

const CategoricalFilter = <T extends V = V>({
  countsAtom,
  selectedValuesAtom,
  excludeAtom,
  path,
  modal,
  named = true,
  title,
}: Props<T>) => {
  const name = path.split(".").slice(-1)[0];
  const color = useRecoilValue(fos.pathColor({ modal, path }));
  const countsLoadable = useRecoilValueLoadable(countsAtom);
  const selectedCounts = useRef(new Map<V["value"], number>());
  const onSelect = useOnSelect(selectedValuesAtom, selectedCounts);
  const useSearch = getUseSearch({ modal, path });
  const skeleton = useRecoilValue(isKeypointLabel(path));
  const theme = useTheme();

  if (countsLoadable.state !== "hasValue") return null;

  const { count, results } = countsLoadable.contents;

  return (
    <NamedCategoricalFilterContainer title={title}>
      <NamedCategoricalFilterHeader>
        {named && name && <>{name.replaceAll("_", " ")}</>}
      </NamedCategoricalFilterHeader>
      <CategoricalFilterContainer
        onMouseDown={(event) => event.stopPropagation()}
      >
        {results.length > CHECKBOX_LIMIT && !skeleton && (
          <Selector
            useSearch={useSearch}
            placeholder={
              results === null ? "Loading..." : `+ filter by ${name}`
            }
            component={ResultComponent}
            onSelect={onSelect}
            inputStyle={{
              color: theme.text.secondary,
              fontSize: "1rem",
              width: "100%",
            }}
            containerStyle={{ borderBottomColor: color, zIndex: 1000 }}
            toKey={({ value }) => String(value)}
          />
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
