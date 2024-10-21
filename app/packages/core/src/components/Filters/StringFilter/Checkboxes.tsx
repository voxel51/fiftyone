import { LoadingDots } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import React from "react";
import type { RecoilState } from "recoil";
import {
  selectorFamily,
  useRecoilState,
  useRecoilValue,
  useRecoilValueLoadable,
} from "recoil";
import Checkbox from "../../Common/Checkbox";
import FilterOption from "../FilterOption/FilterOption";
import { isBooleanField, isInKeypointsField } from "../state";
import { CHECKBOX_LIMIT, nullSort } from "../utils";
import Reset from "./Reset";
import type { Result } from "./Result";
import { pathSearchCount } from "./state";

interface CheckboxesProps {
  color: string;
  excludeAtom: RecoilState<boolean>;
  isMatchingAtom: RecoilState<boolean>;
  modal: boolean;
  path: string;
  results: Result[] | null;
  selectedAtom: RecoilState<(string | null)[]>;
}

const isSkeleton = selectorFamily({
  key: "isSkeleton",
  get:
    (path: string) =>
    ({ get }) =>
      get(isInKeypointsField(path)) &&
      path.split(".").slice(-1)[0] === "keypoints",
});

const checkboxCounts = selectorFamily({
  key: "checkboxCounts",
  get:
    ({ modal, path }: { modal: boolean; path: string }) =>
    ({ get }) => {
      const map = new Map<string | null, number | null>();
      if (get(isSkeleton(path))) {
        return map;
      }

      if (!modal && get(fos.queryPerformance)) {
        return map;
      }

      const data = get(fos.counts({ modal, path, extended: false }));
      for (const i in data) {
        map.set(i, data[i]);
      }
      return map;
    },
});

const useCounts = (modal: boolean, path: string, results: Result[] | null) => {
  const loadable = useRecoilValueLoadable(checkboxCounts({ modal, path }));
  const queryPerformance = useRecoilValue(fos.queryPerformance);
  const data =
    loadable.state === "hasValue"
      ? loadable.contents
      : new Map<string | null, number | null>();

  const loading = loadable.state === "loading";

  if (results) {
    for (const { count, value } of results) {
      if (!data.has(value)) {
        data.set(value, loading || queryPerformance ? count : count ?? 0);
      }
    }
  }

  return { counts: data, loading };
};

const useValues = ({
  modal,
  path,
  results,
  selected,
}: {
  modal: boolean;
  path: string;
  results: Result[] | null;
  selected: (string | null)[];
}) => {
  const name = path.split(".").slice(-1)[0];
  const queryPerformance = useRecoilValue(fos.queryPerformance);
  const skeleton = useRecoilValue(isSkeleton(path));
  const { counts, loading } = useCounts(modal, path, results);
  const hasCount = (!queryPerformance || modal) && !loading;

  let allValues = selected.map((value) => ({
    value,
    count: hasCount ? counts.get(value) ?? null : null,
    loading: loading,
  }));
  const objectId = useRecoilValue(fos.isObjectIdField(path));
  const selectedSet = new Set(selected);
  const boolean = useRecoilValue(isBooleanField(path));

  const hasCheckboxResults =
    (!queryPerformance && counts.size <= CHECKBOX_LIMIT && !objectId) ||
    skeleton ||
    boolean;

  const sorting = useRecoilValue(fos.sortFilterResults(modal));

  if (hasCheckboxResults) {
    allValues = [
      ...allValues,
      ...Array.from(counts.keys())
        .filter((key) => !selectedSet.has(key))
        .map((key) => ({
          value: key,
          count: counts.get(key) ?? null,
          loading: false,
        })),
    ];
  }

  return {
    name,
    selectedSet,
    sorting: !queryPerformance ? sorting : { asc: true, count: false },
    values: [...new Set(allValues)],
    loading: !queryPerformance && loading,
  };
};

const useGetCount = (modal: boolean, path: string) => {
  const isFilterMode = useRecoilValue(fos.isSidebarFilterMode);
  const keypoints = useRecoilValue(isInKeypointsField(path));
  const queryPerformance = useRecoilValue(fos.queryPerformance);
  return (count: number | null, value: string | null) => {
    // show no count for the 'points' field of a Keypoint, and visibility mode
    if (!isFilterMode || keypoints) {
      return undefined;
    }

    // request subcount when query performance is disabled
    if (typeof count !== "number" && !queryPerformance) {
      return pathSearchCount({ modal, path, value: value as string });
    }

    return count ?? undefined;
  };
};

const Checkboxes = ({
  color,
  excludeAtom,
  isMatchingAtom,
  modal,
  path,
  results,
  selectedAtom,
}: CheckboxesProps) => {
  const [selected, setSelected] = useRecoilState(selectedAtom);
  const queryPerformance = useRecoilValue(fos.queryPerformance);

  const { loading, name, selectedSet, sorting, values } = useValues({
    modal,
    path,
    results,
    selected,
  });

  const show = useRecoilValue(isBooleanField(path));
  const getCount = useGetCount(modal, path);

  if (!modal && queryPerformance && values.length === 0) {
    return null;
  }

  // if results are null, and show is false, values are loading
  if (loading || (!show && results === null)) {
    return <LoadingDots text={"Loading"} />;
  }

  if (
    !show &&
    (results?.length ?? 0) <= CHECKBOX_LIMIT &&
    values.length === 0
  ) {
    return <>No results</>;
  }

  return (
    <>
      {values.sort(nullSort(sorting)).map(({ count, loading, value }) => {
        return (
          <Checkbox
            key={value}
            color={color}
            value={selectedSet.has(value)}
            forceColor={value === null}
            name={value === null ? "None" : value}
            loading={loading}
            count={getCount(count, value)}
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
        );
      })}
      {!!selectedSet.size && (
        <>
          <FilterOption
            color={color}
            excludeAtom={excludeAtom}
            isMatchingAtom={isMatchingAtom}
            modal={modal}
            path={path}
            valueName={name}
          />
          <Reset color={color} modal={modal} path={path} />
        </>
      )}
    </>
  );
};

export default Checkboxes;
