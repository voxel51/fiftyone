import React, { MutableRefObject } from "react";
import {
  RecoilState,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";

import * as fos from "@fiftyone/state";

import Checkbox from "../../Common/Checkbox";
import { Button } from "../../utils";
import { CHECKBOX_LIMIT, nullSort } from "../utils";
import { V, isKeypointLabel } from "./CategoricalFilter";
import FilterOption from "./filterOption/FilterOption";

interface WrapperProps {
  results: [V["value"], number][];
  selectedValuesAtom: RecoilState<V["value"][]>;
  excludeAtom: RecoilState<boolean>;
  isMatchingAtom: RecoilState<boolean>;
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
  isMatchingAtom,
  modal,
  path,
  selectedCounts,
}: WrapperProps) => {
  const name = path.split(".").slice(-1)[0];
  const schema = useRecoilValue(fos.field(path));
  const [selected, setSelected] = useRecoilState(selectedValuesAtom);
  const selectedSet = new Set(selected);
  const [excluded, setExcluded] = useRecoilState(excludeAtom);
  const setIsMatching = useSetRecoilState(isMatchingAtom);
  const sorting = useRecoilValue(fos.sortFilterResults(modal));
  const isFilterMode = useRecoilValue(fos.isSidebarFilterMode);

  const counts = Object.fromEntries(results);
  let allValues: V[] = selected.map<V>((value) => ({
    value,
    count: counts[String(value)] ?? 0,
  }));
  const skeleton = useRecoilValue(isKeypointLabel(path));
  const neverShowExpansion = schema?.ftype.includes("ObjectIdField");

  if ((results.length <= CHECKBOX_LIMIT && !neverShowExpansion) || skeleton) {
    allValues = [
      ...allValues,
      ...results
        .filter(([v]) => !selectedSet.has(v))
        .map(([value, count]) => ({ value, count })),
    ];
  }

  allValues = [...new Set(allValues)];

  // only show all four options the field is a nested ListField.
  // pass down nestedField as a prop to generate options. (e.g. "detections")
  const fieldPath = path.split(".").slice(0, -1).join(".");
  const fieldSchema = useRecoilValue(fos.field(fieldPath));
  const nestedField = fieldSchema?.ftype.includes("ListField")
    ? fieldSchema?.dbField?.toLowerCase()
    : undefined;

  // if the field is a BooleanField or ListField(BooleanField), there is no need to show the exclude option
  const shouldNotShowExclude =
    schema?.ftype.includes("BooleanField") ||
    schema?.subfield?.includes("BooleanField");

  // if the field is a keypoint label, there is no need to show match options
  const isKeyPoints = fieldSchema?.dbField === "keypoints";

  const initializeSettings = () => {
    excluded && setExcluded(false);
    setIsMatching(!nestedField);
  };

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

  return (
    <>
      {allValues.sort(nullSort(sorting)).map(({ value, count }) => (
        <Checkbox
          key={String(value)}
          color={color}
          value={selectedSet.has(value)}
          name={value}
          count={
            count < 0 || !isFilterMode
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
          {
            <FilterOption
              nestedField={nestedField}
              shouldNotShowExclude={Boolean(shouldNotShowExclude)}
              excludeAtom={excludeAtom}
              isMatchingAtom={isMatchingAtom}
              valueName={name}
              color={color}
              modal={modal}
              path={path}
              isKeyPointLabel={isKeyPoints}
            />
          }
          <Button
            text={"Reset"}
            color={color}
            onClick={() => {
              setSelected([]);
              initializeSettings();
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

export default Wrapper;
