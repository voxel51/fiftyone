import { Loading } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { useEffect, useMemo } from "react";
import { useRecoilValue } from "recoil";
import { SampleWrapper } from "../Sample2D";
import { Sample3d } from "../Sample3d";
import { GroupSampleWrapper } from "./GroupSampleWrapper";
import { GroupSuspense } from "./GroupSuspense";

const Sample3dWrapper = () => {
  const {
    state: { interactionSample, isPinned },
    actions,
  } = fos.useRenderConfig3d();

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
  const {
    state: { activeSlices, allSampleMapLoadable, pinnedSlice },
    actions,
  } = fos.useRenderConfig3d();
  const modalId = useRecoilValue(fos.modalSampleId);
  const sampleMapKey = useMemo(() => {
    if (allSampleMapLoadable.state !== "hasValue") {
      return allSampleMapLoadable.state;
    }

    return Object.keys(allSampleMapLoadable.contents).sort().join(",");
  }, [allSampleMapLoadable]);

  if (allSampleMapLoadable.state === "hasError") {
    throw allSampleMapLoadable.contents;
  }

  useEffect(() => {
    if (allSampleMapLoadable.state !== "hasValue") {
      return;
    }

    actions.reconcileAvailableSlices();
  }, [
    actions,
    activeSlices,
    allSampleMapLoadable.state,
    modalId,
    pinnedSlice,
    sampleMapKey,
  ]);

  if (
    allSampleMapLoadable.state === "hasValue" &&
    !Object.keys(allSampleMapLoadable.contents).length
  ) {
    return <Loading>No 3D slices</Loading>;
  }

  if (
    allSampleMapLoadable.state === "loading" ||
    !allSampleMapLoadable.contents[pinnedSlice || ""]
  ) {
    return <Loading>Pixelating...</Loading>;
  }

  return (
    <GroupSuspense>
      <Sample3dWrapper />
    </GroupSuspense>
  );
};
