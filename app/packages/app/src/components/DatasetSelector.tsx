import { Link, Selector, UseSearch } from "@fiftyone/components";
import { datasetName } from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import useSetDataset from "../useSetDataset";

const DatasetLink: React.FC<{ value: string; className: string }> = ({
  className,
  value,
}) => {
  return (
    <Link title={value} className={className}>
      {value}
    </Link>
  );
};

const DatasetSelector: React.FC<{
  useSearch: UseSearch<string>;
}> = ({ useSearch }) => {
  const setDataset = useSetDataset();
  const dataset = useRecoilValue(datasetName);
  return (
    <Selector<string>
      component={DatasetLink}
      placeholder={"Select dataset"}
      inputStyle={{ height: 40, maxWidth: 300 }}
      containerStyle={{ position: "relative" }}
      onSelect={(name) => {
        name !== dataset && setDataset(name);
      }}
      overflow={true}
      useSearch={useSearch}
      value={dataset}
    />
  );
};

export default DatasetSelector;
