import * as fos from "@fiftyone/state";
import React, { MutableRefObject } from "react";
import { RecoilState, useRecoilState, useRecoilValue } from "recoil";
import Checkbox from "../../Common/Checkbox";
import FilterOption from "../FilterOption/FilterOption";
import { isInKeypointsField, isObjectIdField } from "../state";
import { CHECKBOX_LIMIT, nullSort } from "../utils";
import Reset from "./Reset";
import { Result } from "./Result";

interface ResultsProps {
  results: Result[];
  selectedAtom: RecoilState<(string | null)[]>;
  excludeAtom: RecoilState<boolean>;
  isMatchingAtom: RecoilState<boolean>;
  modal: boolean;
  path: string;
  selected: MutableRefObject<Map<string | null, number | null>>;
  lightning: boolean;
}

const Results = ({
  results,
  selectedAtom,
  excludeAtom,
  isMatchingAtom,
  modal,
  path,
  selected: selectedRef,
  lightning,
}: ResultsProps) => {
  const name = path.split(".").slice(-1)[0];
  const [selected, setSelected] = useRecoilState(selectedAtom);
  const color = useRecoilValue(fos.pathColor(path));
  const selectedSet = new Set(selected);
  const sorting = useRecoilValue(fos.sortFilterResults(modal));
  const isFilterMode = useRecoilValue(fos.isSidebarFilterMode);

  const counts = new Map(results.map(({ count, value }) => [value, count]));
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
      ...results.filter(({ value }) => !selectedSet.has(value)),
    ];
  }

  allValues = [...new Set(allValues)];

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
              : selectedRef.current.has(value)
              ? selectedRef.current.get(value) ?? undefined
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
          <Reset
            excludeAtom={excludeAtom}
            isMatchingAtom={isMatchingAtom}
            path={path}
            selectedAtom={selectedAtom}
          />
        </>
      )}
    </>
  );
};

export default Results;
