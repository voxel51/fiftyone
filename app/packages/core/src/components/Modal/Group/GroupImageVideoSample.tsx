import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilValue, useResetRecoilState } from "recoil";
import { ModalLooker } from "../ModalLooker";
import { GroupSampleWrapper } from "./GroupSampleWrapper";

export const GroupImageVideoSample = () => {
  const sample = useRecoilValue(fos.modalSample);

  const pinned = !useRecoilValue(fos.pinned3d);
  const reset = useResetRecoilState(fos.pinned3d);
  const hover = fos.useHoveredSample(sample.sample);

  return (
    <GroupSampleWrapper
      sampleId={sample.sample._id}
      pinned={pinned}
      onClick={reset}
      {...hover.handlers}
    >
      <ModalLooker sample={sample} key={sample.id} />
    </GroupSampleWrapper>
  );
};
