import { Loading } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import React, { useEffect } from "react";
import {
  useRecoilState,
  useRecoilTransaction_UNSTABLE,
  useRecoilValue,
  useRecoilValueLoadable,
} from "recoil";
import { Sample3d } from "../Sample3d";
import { GroupSampleWrapper } from "./GroupSampleWrapper";

const Sample3dWrapper = () => {
  const sample = useRecoilValue(fos.pinned3DSample);
  const [pinned, setPinned] = useRecoilState(fos.pinned3d);
  const hover = fos.useHoveredSample(sample);

  return (
    <GroupSampleWrapper
      sampleId={sample.id}
      pinned={pinned}
      onClick={() => setPinned(true)}
      {...hover.handlers}
    >
      <Sample3d />
    </GroupSampleWrapper>
  );
};

export default () => {
  const pcdSlices = useRecoilValueLoadable(fos.allPcdSlicesToSampleMap);

  const pinnedSlice = useRecoilValue(fos.pinned3DSampleSlice);
  const slices = useRecoilValue(fos.allPcdSlices);
  const groupSlice = useRecoilValue(fos.groupSlice(true));

  if (pcdSlices.state === "hasError") {
    throw pcdSlices.contents;
  }

  const assignSlices = useRecoilTransaction_UNSTABLE(
    ({ set }) =>
      (
        slices: string[],
        samples: {
          [k: string]: fos.ModalSample;
        }
      ) => {
        let newSlice = pinnedSlice;
        for (let index = 0; index < slices.length; index++) {
          const element = slices[index];
          if (samples[element]) {
            set(fos.pinned3DSampleSlice, element);
            newSlice = element;
            break;
          }
        }

        set(fos.activePcdSlices, (cur) =>
          Array.from(new Set([newSlice, ...cur.filter((s) => samples[s])]))
        );
      },
    []
  );

  useEffect(() => {
    if (pcdSlices.state !== "hasValue") {
      return;
    }

    if (slices.includes(groupSlice)) {
      return;
    }

    if (pcdSlices.contents[pinnedSlice]) {
      return;
    }

    assignSlices(slices, pcdSlices.contents);
  }, [assignSlices, slices, groupSlice, pinnedSlice, pcdSlices]);

  if (pcdSlices.state === "loading" || !pinnedSlice) {
    return <Loading>Pixelating...</Loading>;
  }

  if (
    pcdSlices.state === "hasValue" &&
    !Object.keys(pcdSlices.contents).length
  ) {
    return <Loading>No PCD slices</Loading>;
  }

  if (!pcdSlices.contents[pinnedSlice]) {
    return <Loading>Pixelating...</Loading>;
  }

  return <Sample3dWrapper />;
};
