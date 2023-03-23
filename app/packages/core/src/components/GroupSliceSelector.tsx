import { Selector } from "@fiftyone/components";
import {
  defaultGroupSlice,
  groupSlice,
  groupSlices,
  useSetGroupSlice,
} from "@fiftyone/state";
import React, { useCallback, useEffect } from "react";
import { useRecoilValue } from "recoil";

const Slice: React.FC<{ value: string; className: string }> = ({ value }) => {
  return <>{value}</>;
};

const GroupSlice: React.FC = () => {
  const slice = useRecoilValue(groupSlice(false));
  const defaultSlice = useRecoilValue(defaultGroupSlice);
  const setSlice = useSetGroupSlice();
  const groupSlicesValue = useRecoilValue(groupSlices);

  /**
   * this effect syncs the session slice with the default slice on component load
   * (todo: rm network side effect and move to session subscription initialization)
   */
  useEffect(() => {
    setSlice(defaultSlice);
    // only run on mount, setSlice dependency should be stable but somehow changes on every render (todo: fix)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultSlice]);

  const useSearch = useCallback(
    (search: string) => {
      const values = groupSlicesValue.filter((name) => name.includes(search));
      return { values, total: values.length };
    },
    [groupSlicesValue]
  );

  return (
    <Selector
      inputStyle={{ height: 28 }}
      component={Slice}
      containerStyle={{
        marginLeft: "0.5rem",
        position: "relative",
      }}
      onSelect={setSlice}
      overflow={true}
      placeholder={"slice"}
      useSearch={useSearch}
      value={slice || defaultSlice}
    />
  );
};

export default GroupSlice;
