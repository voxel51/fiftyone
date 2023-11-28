import * as fos from "@fiftyone/state";
import React, { MutableRefObject } from "react";
import {
  RecoilState,
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
import { Result } from "./Result";

interface CheckboxesProps {
  results: Result[] | null;
  selectedAtom: RecoilState<(string | null)[]>;
  excludeAtom: RecoilState<boolean>;
  isMatchingAtom: RecoilState<boolean>;
  modal: boolean;
  path: string;
  selectedMap: MutableRefObject<Map<string | null, number | null>>;
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
  results?.forEach(({ value, count }) => {
    if (!data.has(value)) {
      data.set(value, loading || (lightning && !unlocked) ? count : count ?? 0);
    }
  });

  return { counts: data, loading };
};

const useValues = ({
  modal,
  path,
  results,
  selected,
  selectedMap,
}: {
  modal: boolean;
  path: string;
  results: Result[] | null;
  selected: (string | null)[];
  selectedMap: Map<string | null, number | null>;
}) => {
  const name = path.split(".").slice(-1)[0];
  const unlocked = fos.useLightingUnlocked();
  const lightning = useRecoilValue(fos.lightning);
  const lightningPath =
    useRecoilValue(fos.isLightningPath(path)) && lightning && !modal;
  const skeleton = useRecoilValue(isSkeleton(path));
  const { counts, loading } = useCounts(modal, path, results);
  const hasCount = (!lightning || unlocked || modal) && !loading;

  let allValues = selected.map((value) => ({
    value,
    count: hasCount ? counts.get(value) || selectedMap.get(value) || 0 : null,
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
  };
};

const Checkboxes = ({
  results,
  selectedAtom,
  excludeAtom,
  isMatchingAtom,
  modal,
  path,
  selectedMap,
}: CheckboxesProps) => {
  const [selected, setSelected] = useRecoilState(selectedAtom);
  const color = useRecoilValue(fos.pathColor(path));
  const isFilterMode = useRecoilValue(fos.isSidebarFilterMode);

  const { name, selectedSet, sorting, values } = useValues({
    modal,
    path,
    results,
    selected,
    selectedMap: selectedMap.current,
  });

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
            count={
              typeof count !== "number" || !isFilterMode
                ? undefined
                : selectedMap.current.get(value) ?? count
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
        );
      })}
      {!!selectedSet.size && (
        <>
          <FilterOption
            excludeAtom={excludeAtom}
            isMatchingAtom={isMatchingAtom}
            valueName={name}
            modal={modal}
            path={path}
          />
          <Reset modal={modal} path={path} />
        </>
      )}
    </>
  );
};

export default Checkboxes;
