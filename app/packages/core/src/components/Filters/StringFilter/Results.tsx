import * as fos from "@fiftyone/state";
import React, { MutableRefObject } from "react";
import {
  RecoilState,
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import Checkbox from "../../Common/Checkbox";
import FilterOption from "../FilterOption/FilterOption";
import { isInKeypointsField, isObjectIdField } from "../state";
import { CHECKBOX_LIMIT, nullSort } from "../utils";
import Reset from "./Reset";

interface ResultsProps {
  results: [string | null, number | null][];
  selectedValuesAtom: RecoilState<(string | null)[]>;
  excludeAtom: RecoilState<boolean>;
  isMatchingAtom: RecoilState<boolean>;
  modal: boolean;
  path: string;
  selectedCounts: MutableRefObject<Map<string | null, number | null>>;
  lightning: boolean;
}

const Results = ({
  results,
  selectedValuesAtom,
  excludeAtom,
  isMatchingAtom,
  modal,
  path,
  selectedCounts,
  lightning,
}: ResultsProps) => {
  const name = path.split(".").slice(-1)[0];
  const [selected, setSelected] = useRecoilState(selectedValuesAtom);
  const color = useRecoilValue(fos.pathColor(path));
  const selectedSet = new Set(selected);
  const [excluded, setExcluded] = useRecoilState(excludeAtom);
  const setIsMatching = useSetRecoilState(isMatchingAtom);
  const sorting = useRecoilValue(fos.sortFilterResults(modal));
  const isFilterMode = useRecoilValue(fos.isSidebarFilterMode);

  const counts = new Map(results);
  let allValues = selected.map((value) => ({
    value,
    count: counts.get(value) ?? (0 as number | null),
  }));
  const skeleton =
    useRecoilValue(isInKeypointsField(path)) && name === "keypoints";
  const neverShowExpansion = useRecoilValue(isObjectIdField(path));

  if ((results.length <= CHECKBOX_LIMIT && !neverShowExpansion) || skeleton) {
    allValues = [
      ...allValues,
      ...results
        .filter(([v]) => !selectedSet.has(v))
        .map(([value, count]) => ({ value, count })),
    ];
  }

  allValues = [...new Set(allValues)];

  const handleReset = useRecoilCallback(({ snapshot }) => async () => {
    setSelected([]);
    excluded && setExcluded(false);
    isFilterMode && setIsMatching(!nestedField);
  });

  if (!allValues.length && neverShowExpansion) {
    return lightning ? null : (
      <Checkbox
        key={"No results"}
        color={color}
        value={false}
        disabled={true}
        name={"No results"}
      />
    );
  }

  return (
    <>
      {allValues.sort(nullSort(sorting)).map(({ value, count }) => (
        <Checkbox
          key={String(value)}
          color={color}
          value={selectedSet.has(value)}
          name={value}
          count={
            typeof count !== "number" || !isFilterMode
              ? undefined
              : selectedCounts.current.has(value)
              ? selectedCounts.current.get(value) ?? undefined
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
      {!!selectedSet.size && (
        <>
          <FilterOption
            excludeAtom={excludeAtom}
            isMatchingAtom={isMatchingAtom}
            valueName={name}
            modal={modal}
            path={path}
          />
          <Reset />
        </>
      )}
    </>
  );
};

export default Results;
