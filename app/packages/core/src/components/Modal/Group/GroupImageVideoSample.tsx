import { ImageLooker, VideoLooker } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import { pinned3DSample, useClearModal } from "@fiftyone/state";
import React, { MutableRefObject } from "react";
import { useRecoilValue, useResetRecoilState } from "recoil";
import Looker from "../Looker";
import { useGroupContext } from "./GroupContextProvider";
import { GroupSampleWrapper } from "./GroupSampleWrapper";

export const GroupImageVideoSample: React.FC<{
  lookerRef: MutableRefObject<VideoLooker | ImageLooker | undefined>;
}> = ({ lookerRef }) => {
  const sample = useRecoilValue(fos.modalSample);

  const clearModal = useClearModal();
  const pinned = !useRecoilValue(pinned3DSample);
  const reset = useResetRecoilState(pinned3DSample);
  const hover = fos.useHoveredSample(sample.sample);
  const { lookerRefCallback } = useGroupContext();

  return (
    <GroupSampleWrapper
      sampleId={sample.sample._id}
      pinned={pinned}
      onClick={reset}
      {...hover.handlers}
    >
      <Looker
        sample={sample}
        key={sample.sample._id}
        lookerRef={lookerRef}
        lookerRefCallback={lookerRefCallback}
        onClose={clearModal}
      />
    </GroupSampleWrapper>
  );
};
