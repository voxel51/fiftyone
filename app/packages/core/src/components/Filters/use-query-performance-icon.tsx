import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import { LightningBolt } from "../Sidebar/Entries/FilterablePathEntry/Icon";

const Icon = ({ path }: { path: string }) => {
  const hasFilters = useRecoilValue(fos.hasFilters(false));
  const filteredIndex = useRecoilValue(
    fos.pathHasIndexes({ path, withFilters: true })
  );
  const color = useRecoilValue(fos.pathColor(path));

  return (
    <LightningBolt
      color={filteredIndex ? color : undefined}
      tooltip={filteredIndex && hasFilters ? "Compound index" : "Indexed"}
    />
  );
};

export default function useQueryPerformanceIcon(
  modal: boolean,
  named: boolean,
  path: string
) {
  const filteredIndex = useRecoilValue(
    fos.pathHasIndexes({ path, withFilters: true })
  );
  const frameField = useRecoilValue(fos.isFrameField(path));
  const indexed = useRecoilValue(fos.pathHasIndexes({ path }));
  const queryPerformance = useRecoilValue(fos.queryPerformance);

  const showQueryPerformanceIcon =
    named &&
    queryPerformance &&
    (indexed || filteredIndex) &&
    !modal &&
    !frameField;

  if (!showQueryPerformanceIcon) {
    return null;
  }

  return <Icon path={path} />;
}
