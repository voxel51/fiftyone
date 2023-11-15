import * as fos from "@fiftyone/state";
import React, { MutableRefObject } from "react";
import { RecoilState, useRecoilState, useRecoilValue } from "recoil";
import Checkbox from "../../Common/Checkbox";
import FilterOption from "../FilterOption/FilterOption";
import { isInKeypointsField } from "../state";
import { CHECKBOX_LIMIT, nullSort } from "../utils";
import Reset from "./Reset";
import { Result } from "./Result";

interface CheckboxesProps {
  results: Result[];
  selectedAtom: RecoilState<(string | null)[]>;
  excludeAtom: RecoilState<boolean>;
  isMatchingAtom: RecoilState<boolean>;
  modal: boolean;
  path: string;
  selectedMap: MutableRefObject<Map<string | null, number | null>>;
}

const useValues = ({
  modal,
  path,
  selected,
  selectedMap,
  results,
}: {
  modal: boolean;
  path: string;
  results: Result[];
  selected: (string | null)[];
  selectedMap: Map<string | null, number | null>;
}) => {
  const name = path.split(".").slice(-1)[0];
  const unlocked = fos.useLightingUnlocked();
  const lightning = useRecoilValue(fos.lightning);
  const lightningPath =
    useRecoilValue(fos.isLightningPath(path)) && lightning && !modal;
  const skeleton =
    useRecoilValue(isInKeypointsField(path)) && name === "keypoints";

  const counts = new Map(results.map(({ count, value }) => [value, count]));
  let allValues = selected.map((value) => ({
    value,
    count: counts.get(value) || selectedMap.get(value),
    loading: lightningPath && unlocked && counts.get(value) === undefined,
  }));

  const objectId = useRecoilValue(fos.isObjectIdField(path));
  const selectedSet = new Set(selected);
  if (
    (!lightningPath && results.length <= CHECKBOX_LIMIT && !objectId) ||
    skeleton
  ) {
    allValues = [
      ...allValues,
      ...results
        .filter(({ value }) => !selectedSet.has(value))
        .map((d) => ({ ...d, loading: false })),
    ];
  }

  return { name, selectedSet, values: [...new Set(allValues)] };
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
  const sorting = useRecoilValue(fos.sortFilterResults(modal));
  const isFilterMode = useRecoilValue(fos.isSidebarFilterMode);

  const { name, selectedSet, values } = useValues({
    modal,
    path,
    results,
    selected,
    selectedMap: selectedMap.current,
  });

  return (
    <>
      {values.sort(nullSort(sorting)).map(({ count, loading, value }) => (
        <Checkbox
          key={String(value)}
          color={color}
          value={selectedSet.has(value)}
          name={value}
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
      ))}
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
