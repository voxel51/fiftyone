import * as fos from "@fiftyone/state";
import {
  defaultPcdSlice,
  pcdSampleQueryFamily,
  pinned3DSample,
} from "@fiftyone/state";
import React, { useEffect } from "react";

import { useRecoilState, useRecoilValue } from "recoil";
import { Sample3d } from "../Sample3d";
import { GroupSampleWrapper } from "./GroupSampleWrapper";

export const GroupSample3d: React.FC = () => {
  const [pinned, setPinned] = useRecoilState(pinned3DSample);
  const slice = useRecoilValue(defaultPcdSlice) as string;
  const { sample } = useRecoilValue(pcdSampleQueryFamily(slice));
  const hover = fos.useHoveredSample(sample.sample);

  useEffect(() => () => setPinned(null), []);

  return (
    <GroupSampleWrapper
      sampleId={sample._id}
      pinned={Boolean(pinned)}
      onClick={() => setPinned(sample._id)}
      {...hover.handlers}
    >
      <Sample3d />
    </GroupSampleWrapper>
  );
};
