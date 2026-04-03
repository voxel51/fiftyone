import { type UseSearch } from "@fiftyone/components";
import { datasetName, useSetDataset } from "@fiftyone/state";
import { Select, SelectAnchor } from "@voxel51/voodo";
import React, { useMemo } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";

const Wrapper = styled.div`
  max-width: 160px;
  min-width: 80px;
  display: flex;
  align-items: center;
  padding-left: 1rem;
  margin-left: 0.5rem;
  border-left: 1px solid ${({ theme }) => theme.primary.plainBorder};
`;

const DatasetSelector: React.FC<{
  useSearch: UseSearch<string>;
}> = ({ useSearch }) => {
  const setDataset = useSetDataset();
  const dataset = useRecoilValue(datasetName) as string;
  const { values = [] } = useSearch("");

  const options = useMemo(
    () => values.map((name) => ({ id: name, data: { label: name } })),
    [values]
  );

  return (
    <Wrapper>
      <Select
        exclusive
        portal
        anchor={SelectAnchor.BottomStart}
        value={dataset ?? undefined}
        onChange={(value) => {
          if (typeof value === "string") setDataset(value);
        }}
        options={options}
      />
    </Wrapper>
  );
};

export default DatasetSelector;
