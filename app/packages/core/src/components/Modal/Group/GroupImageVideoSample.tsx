import { ImageLooker, VideoLooker } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import React, { MutableRefObject } from "react";
import { useRecoilValue, useResetRecoilState } from "recoil";
import Looker from "../Looker";
import { useGroupContext } from "./GroupContextProvider";
import { GroupSampleWrapper } from "./GroupSampleWrapper";

export const GroupImageVideoSample: React.FC<{
  lookerRef: MutableRefObject<VideoLooker | ImageLooker | undefined>;
}> = ({ lookerRef }) => {
  const sample = useRecoilValue(fos.modalSample);

  const pinned = !useRecoilValue(fos.pinned3d);
  const reset = useResetRecoilState(fos.pinned3d);
  const hover = fos.useHoveredSample(sample.sample);
  const { lookerRefCallback } = useGroupContext();

  return (
    <GroupSampleWrapper
      sampleId={sample.id}
      pinned={pinned}
      onClick={reset}
      {...hover.handlers}
    >
      <Looker
        sample={sample}
        key={sample.id}
        lookerRef={lookerRef}
        lookerRefCallback={lookerRefCallback}
      />
    </GroupSampleWrapper>
  );
};
