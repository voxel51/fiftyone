import { Selector, UseSearch } from "@fiftyone/components";
import { datasetName, useSetDataset } from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";

const DatasetLink: React.FC<{ value: string; className?: string }> = ({
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

  return (
    <Selector<string>
      component={DatasetLink}
      placeholder={"Select dataset"}
      inputStyle={{ height: 40, maxWidth: 300 }}
      containerStyle={{ position: "relative" }}
      onSelect={async (name) => {
        setDataset(name);
        return name;
      }}
      overflow={true}
      useSearch={useSearch}
      value={dataset}
    />
  );
};

export default DatasetSelector;
