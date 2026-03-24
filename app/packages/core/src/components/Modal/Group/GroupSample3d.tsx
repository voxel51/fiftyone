import { Loading } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { useEffect, useMemo } from "react";
import { useRecoilValue } from "recoil";
import { SampleWrapper } from "../Sample2D";
import { Sample3d } from "../Sample3d";
import { GroupSampleWrapper } from "./GroupSampleWrapper";
import { GroupSuspense } from "./GroupSuspense";

const Sample3dWrapper = () => {
  const { interactionSample, isPinned } = fos.useRenderConfig3dState();
  const actions = fos.useRenderConfig3dActions();

  const hover = fos.useHoveredSample(interactionSample.sample);
  const hasGroupView = !useRecoilValue(fos.only3d);

  return hasGroupView ? (
    <GroupSampleWrapper
      sampleId={interactionSample.sample._id}
      pinned={isPinned}
      onClick={() => actions.setPinned(true)}
      {...hover.handlers}
    >
      <Sample3d />
    </GroupSampleWrapper>
  ) : (
    <SampleWrapper sample={interactionSample}>
      <Sample3d />
    </SampleWrapper>
  );
};

export default () => {
  const { activeSlices, allSampleMap, pinnedSlice } =
    fos.useRenderConfig3dState();
  const actions = fos.useRenderConfig3dActions();
  const modalId = useRecoilValue(fos.modalSampleId);
  const sampleMapKey = useMemo(
    () => Object.keys(allSampleMap).sort().join(","),
    [allSampleMap]
  );

  useEffect(() => {
    actions.reconcileAvailableSlices();
  }, [actions, activeSlices, modalId, pinnedSlice, sampleMapKey]);

  if (!Object.keys(allSampleMap).length) {
    return <Loading>No 3D slices</Loading>;
  }

  if (!allSampleMap[pinnedSlice ?? ""]) {
    return <Loading>Pixelating...</Loading>;
  }

  return (
    <GroupSuspense>
      <Sample3dWrapper />
    </GroupSuspense>
  );
};
