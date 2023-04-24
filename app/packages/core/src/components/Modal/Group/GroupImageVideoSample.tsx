import * as fos from "@fiftyone/state";
import {
  currentSlice,
  defaultGroupSlice,
  groupSample as groupSampleSelectorFamily,
  pinned3DSample,
  useClearModal,
} from "@fiftyone/state";
import React, { MutableRefObject, useMemo } from "react";

import { ImageLooker, VideoLooker } from "@fiftyone/looker";
import { useRecoilValue, useResetRecoilState } from "recoil";
import Looker from "../Looker";
import { GroupSampleWrapper } from "./GroupSampleWrapper";

const AltGroupSample: React.FC<{
  lookerRef: MutableRefObject<VideoLooker | undefined>;
  lookerRefCallback?: (looker) => void;
  altSlice: string;
}> = ({ lookerRef, lookerRefCallback, altSlice }) => {
  const { sample, urls } = useRecoilValue(groupSampleSelectorFamily(altSlice));
  const clearModal = useClearModal();
  const reset = useResetRecoilState(pinned3DSample);

  const hover = fos.useHoveredSample(sample);

  return (
    <GroupSampleWrapper
      sampleId={sample._id}
      pinned={false}
      onClick={reset}
      {...hover.handlers}
    >
      <Looker
        key={sample._id}
        sample={sample}
        urls={urls}
        lookerRef={lookerRef}
        lookerRefCallback={lookerRefCallback}
        onClose={clearModal}
      />
    </GroupSampleWrapper>
  );
};

export const GroupImageVideoSample: React.FC<{
  lookerRef: MutableRefObject<VideoLooker | ImageLooker | undefined>;
  lookerRefCallback?: (looker) => void;
}> = ({ lookerRef, lookerRefCallback }) => {
  const { sample, urls } = useRecoilValue(groupSampleSelectorFamily(null));
  const clearModal = useClearModal();
  const pinned = !useRecoilValue(pinned3DSample);
  const reset = useResetRecoilState(pinned3DSample);
  const hover = fos.useHoveredSample(sample);

  const currentModalSlice = useRecoilValue(currentSlice(true));
  const defaultSlice = useRecoilValue(defaultGroupSlice);
  const allSlices = useRecoilValue(fos.groupSlices);
  const altSlice = useMemo(() => {
    if (
      sample._media_type !== "point-cloud" ||
      currentModalSlice !== sample.group.name
    )
      return undefined;

    if (currentModalSlice === defaultSlice) {
      return allSlices.find((s) => s !== defaultSlice);
    }

    return defaultSlice;
  }, [currentModalSlice, defaultSlice, sample, allSlices]);

  if (altSlice) {
    return (
      <AltGroupSample
        lookerRef={lookerRef}
        lookerRefCallback={lookerRefCallback}
        altSlice={altSlice}
      />
    );
  }

  return (
    <GroupSampleWrapper
      sampleId={sample._id}
      pinned={pinned}
      onClick={reset}
      {...hover.handlers}
    >
      <Looker
        sample={sample}
        urls={urls}
        key={sample._id}
        lookerRef={lookerRef}
        lookerRefCallback={lookerRefCallback}
        onClose={clearModal}
      />
    </GroupSampleWrapper>
  );
};
