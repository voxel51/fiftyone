import { Link, Selector } from "@fiftyone/components";
import {
  DatasetKeys,
  datasetName,
  datasetSlug,
  useSetDataset,
} from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";

const DatasetLink: React.FC<{ value: DatasetKeys; className: string }> = ({
  className,
  value,
}) => {
  return (
    <Link title={value.name} className={className}>
      {value.name}
    </Link>
  );
};

const DatasetSelector: React.FC<{
  useSearch: React.ComponentProps<typeof Selector>["useSearch"];
}> = ({ useSearch }) => {
  const setDataset = useSetDataset();
  const dataset = useRecoilValue(datasetName);
  const currentSlug = useRecoilValue(datasetSlug);
  return (
    <Selector<DatasetKeys>
      component={DatasetLink}
      placeholder={"Select dataset"}
      inputStyle={{ height: 40, maxWidth: 300 }}
      containerStyle={{ position: "relative" }}
      onSelect={(datasetKeys) => {
        datasetKeys.slug !== currentSlug && setDataset(datasetKeys);
      }}
      overflow={true}
      useSearch={useSearch}
      value={dataset || ""}
    />
  );
};

export default DatasetSelector;
