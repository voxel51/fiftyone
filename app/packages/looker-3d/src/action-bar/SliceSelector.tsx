import { Selector } from "@fiftyone/components";
import { SelectorProps } from "@fiftyone/components/src/components/Selector/Selector";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo } from "react";
import { useRecoilState } from "recoil";

interface SliceSelectorProps {
  dataset: fos.State.Dataset;
}

const SliceSelectorComponent = ({
  value,
  className,
}: {
  value: string;
  className: string;
}) => {
  return <div className={className}>{value}</div>;
};

export const SliceSelector = ({ dataset }: SliceSelectorProps) => {
  const [pinnedSlice, setPinnedSlice] = useRecoilState(fos.pinnedSlice);

  const allPointCloudSlices = useMemo(
    () =>
      dataset.groupMediaTypes
        .filter((g) => g.mediaType === "point_cloud")
        .map((g) => g.name),
    [dataset]
  );

  const handleChangePinnedSlice = useCallback(
    (newSlice: string) => {
      if (newSlice !== pinnedSlice) {
        setPinnedSlice(newSlice);
      }
    },
    [pinnedSlice, setPinnedSlice]
  );

  const useSearch: SelectorProps<string>["useSearch"] = useCallback(
    (search: string) => {
      const searchResults = allPointCloudSlices.filter((slice) =>
        slice.includes(search)
      );

      return {
        values: searchResults,
        total: searchResults.length,
      };
    },
    [allPointCloudSlices]
  );

  return (
    <Selector<string>
      overflow
      value={pinnedSlice}
      onSelect={handleChangePinnedSlice}
      placeholder="Select pcd"
      inputStyle={{
        height: 30,
        maxWidth: 120,
        userSelect: "none",
      }}
      containerStyle={{
        userSelect: "none",
      }}
      useSearch={useSearch}
      resultsPlacement="top-center"
      component={SliceSelectorComponent}
    />
  );
};
