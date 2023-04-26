import React from "react";
import { GroupView } from "../../GroupView";
import { GroupElementsLinkBar } from "./GroupElementsLinkBar";

export const NestedGroup = () => {
  // const { groupByFieldValue } = useGroupContext();

  // const { data: sampleIdList, hasNext, loadNext } = usePaginationFragment(
  //   foq.paginateDynamicGroupSampleIdsFragment,
  //   useRecoilValue(
  //     fos.dynamicGroupPaginationFragment({
  //       fieldOrExpression: groupByFieldValue!,
  //       fetchIdsOnly: true,
  //     })
  //   )
  // );

  // const prefetchSamples = useRecoilCallback(
  //   ({ snapshot }) => async () => {
  //     // const;
  //   },
  //   []
  // );

  return <GroupView subBar={<GroupElementsLinkBar />} />;
};
