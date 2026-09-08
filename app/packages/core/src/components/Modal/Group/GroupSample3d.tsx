import { Loading } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { Suspense, useEffect, useMemo } from "react";
import { useRecoilValue } from "recoil";
import { SampleWrapper } from "../Sample2D";
import { Sample3d } from "../Sample3d";
import { GroupSampleWrapper } from "./GroupSampleWrapper";

const Sample3dWrapper = () => {
  const interactionSample = fos.useStableInteraction3dSample();
  const isPinned = fos.useIs3dPinned();
  const actions = fos.useRenderConfig3dActions();
  const hover = fos.useHoveredSample(interactionSample?.sample);
  const hasGroupView = !useRecoilValue(fos.only3d);

  if (!interactionSample) return null;

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
  const activeSlices = fos.useActive3dSlices();
  const allSampleMap = fos.useStableAll3dSamplesMap();
  const pinnedSlice = fos.usePinned3dSlice();
  const actions = fos.useRenderConfig3dActions();
  const modalId = useRecoilValue(fos.modalSampleId);
  const sampleMapKey = useMemo(
    () => Object.keys(allSampleMap).sort().join(","),
    [allSampleMap],
  );

  useEffect(() => {
    actions.reconcileAvailableSlices();
  }, [actions, activeSlices, modalId, pinnedSlice, sampleMapKey]);

  if (!Object.keys(allSampleMap).length) {
    return <Loading>Pixelating...</Loading>;
  }

  if (pinnedSlice && !allSampleMap[pinnedSlice]) {
    return <Loading>Pixelating...</Loading>;
  }

  return (
    <Suspense fallback={<Loading>Pixelating...</Loading>}>
      <Sample3dWrapper />
    </Suspense>
  );
};
