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
import { showSearchSelector } from "./useSelected";

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

      if (
        !modal &&
        get(fos.lightning) &&
        get(fos.isLightningPath(path)) &&
        !get(fos.lightningUnlocked)
      ) {
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
  const unlocked = fos.useLightingUnlocked();
  const lightning = useRecoilValue(fos.lightning);
  const data =
    loadable.state === "hasValue"
      ? loadable.contents
      : new Map<string | null, number | null>();

  const loading = loadable.state === "loading";

  if (results) {
    for (const { count, value } of results) {
      if (!data.has(value)) {
        data.set(
          value,
          loading || (lightning && !unlocked) ? count : count ?? 0
        );
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
  const unlocked = fos.useLightingUnlocked();
  const lightning = useRecoilValue(fos.lightning);
  const lightningPath =
    useRecoilValue(fos.isLightningPath(path)) && lightning && !modal;
  const skeleton = useRecoilValue(isSkeleton(path));
  const { counts, loading } = useCounts(modal, path, results);
  const hasCount =
    (!lightning || !lightningPath || unlocked || modal) && !loading;

  let allValues = selected.map((value) => ({
    value,
    count: hasCount ? counts.get(value) ?? null : null,
    loading: unlocked && loading,
  }));
  const objectId = useRecoilValue(fos.isObjectIdField(path));
  const selectedSet = new Set(selected);
  const boolean = useRecoilValue(isBooleanField(path));

  const hasCheckboxResults =
    (!lightningPath && counts.size <= CHECKBOX_LIMIT && !objectId) ||
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
    sorting: !lightningPath ? sorting : { asc: true, count: false },
    values: [...new Set(allValues)],
    loading: !lightning && loading,
  };
};

const useGetCount = (modal: boolean, path: string) => {
  const isFilterMode = useRecoilValue(fos.isSidebarFilterMode);
  const keypoints = useRecoilValue(isInKeypointsField(path));
  const lightning = useRecoilValue(fos.isLightningPath(path));
  return (count: number | null, value: string | null) => {
    // show no count for the 'points' field of a Keypoint, and visibility mode
    if (!isFilterMode || keypoints) {
      return undefined;
    }

    // request subcount for non-lightning paths
    if (typeof count !== "number" && !lightning) {
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

  const { loading, name, selectedSet, sorting, values } = useValues({
    modal,
    path,
    results,
    selected,
  });

  const show = useRecoilValue(showSearchSelector({ modal, path }));
  const getCount = useGetCount(modal, path);

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
