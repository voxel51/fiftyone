import { groupSlice, groupSlices, useSetGroupSlice } from "@fiftyone/state";
import { Select } from "@voxel51/voodo";
import { useMemo } from "react";
import { useReverbValue } from "@fiftyone/reverb";

const GroupSlice = () => {
  const slice = useReverbValue(groupSlice);
  if (!slice) {
    throw new Error("slice not defined");
  }
  const setSlice = useSetGroupSlice();
  const groupSlicesValue = useReverbValue(groupSlices);

  const options = useMemo(
    () =>
      groupSlicesValue.map((name) => ({
        id: name,
        data: { label: name },
      })),
    [groupSlicesValue],
  );

  return (
    <Select
      exclusive
      portal
      value={slice}
      options={options}
      onChange={(v) => {
        if (typeof v === "string") setSlice(v);
      }}
      style={{ marginLeft: "0.5rem", minWidth: 140 }}
    />
  );
};

export default GroupSlice;
