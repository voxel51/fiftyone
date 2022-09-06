import { Selector } from "@fiftyone/components";
import { groupSlice, groupSlices } from "@fiftyone/state";
import React from "react";
import { useRecoilState, useRecoilValue } from "recoil";

const Slice: React.FC<{ value: string; className: string }> = ({ value }) => {
  return <>{value}</>;
};

const GroupSlice: React.FC = () => {
  const [slice, setSlice] = useRecoilState(groupSlice(false));

  return (
    <Selector
      inputStyle={{ height: 28 }}
      component={Slice}
      containerStyle={{ marginLeft: "0.5rem", position: "relative" }}
      onSelect={setSlice}
      overflow={true}
      placeholder={"Slice"}
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
