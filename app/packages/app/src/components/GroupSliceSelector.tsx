import { Selector } from "@fiftyone/components";
import { groupSlice, groupSlices, useSetGroupSlice } from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";

const Slice: React.FC<{ value: string; className: string }> = ({ value }) => {
  return <>{value}</>;
};

const GroupSlice: React.FC = () => {
  const slice = useRecoilValue(groupSlice(false));
  const setSlice = useSetGroupSlice();

  return (
    <Selector
      inputStyle={{ height: 28 }}
      component={Slice}
      containerStyle={{ marginLeft: "0.5rem", position: "relative" }}
      onSelect={setSlice}
      overflow={true}
      placeholder={"slice"}
      useSearch={(search) => {
        const values = useRecoilValue(groupSlices).filter((name) =>
          name.includes(search)
        );
        return { values, total: values.length };
      }}
      value={slice}
    />
  );
};

export default GroupSlice;
