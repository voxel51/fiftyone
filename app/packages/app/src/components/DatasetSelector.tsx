import { Selector, UseSearch } from "@fiftyone/components";
import {
  datasetName,
  excludedPathsState,
  fieldVisibilityStage,
  useSetDataset,
} from "@fiftyone/state";
import React from "react";
import { useRecoilValue, useResetRecoilState, useSetRecoilState } from "recoil";

const DatasetLink: React.FC<{ value: string; className: string }> = ({
  className,
  value,
}) => {
  return (
    <a className={className} title={value}>
      {value}
    </a>
  );
};

const DatasetSelector: React.FC<{
  useSearch: UseSearch<string>;
}> = ({ useSearch }) => {
  const setDataset = useSetDataset();
  const dataset = useRecoilValue(datasetName) as string;
  const resetFieldVisibility = useResetRecoilState(fieldVisibilityStage);

  return (
    <Selector<string>
      component={DatasetLink}
      placeholder={"Select dataset"}
      inputStyle={{ height: 40, maxWidth: 300 }}
      containerStyle={{ position: "relative" }}
      onSelect={(name) => {
        if (name !== dataset) {
          setDataset(name);
          resetFieldVisibility();
        }
      }}
      overflow={true}
      useSearch={useSearch}
      value={dataset}
    />
  );
};

export default DatasetSelector;
