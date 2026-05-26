import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import { ModalLooker } from "../ModalLooker";
import { GroupSampleWrapper } from "./GroupSampleWrapper";

export const GroupImageVideoSample = () => {
  const sample = useRecoilValue(fos.modalSample);
  const isPinned = fos.useIs3dPinned();
  const actions = fos.useRenderConfig3dActions();
  const hover = fos.useHoveredSample(sample.sample);

  return (
    <GroupSampleWrapper
      sampleId={sample.sample._id}
      pinned={!isPinned}
      onClick={() => actions.setPinned(false)}
      {...hover.handlers}
    >
      <ModalLooker sample={sample} key={sample.id} />
    </GroupSampleWrapper>
  );
};
