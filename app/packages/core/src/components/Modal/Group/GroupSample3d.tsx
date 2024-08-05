import { Loading } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { useEffect } from "react";
import {
  useRecoilState,
  useRecoilTransaction_UNSTABLE,
  useRecoilValue,
  useRecoilValueLoadable,
} from "recoil";
import { SampleWrapper } from "../Sample2D";
import { Sample3d } from "../Sample3d";
import { GroupSampleWrapper } from "./GroupSampleWrapper";
import { GroupSuspense } from "./GroupSuspense";

const Sample3dWrapper = () => {
  const sample = useRecoilValue(fos.pinned3DSample);
  const [pinned, setPinned] = useRecoilState(fos.pinned3d);

  const hover = fos.useHoveredSample(sample.sample);
  const hasGroupView = !useRecoilValue(fos.only3d);

  return hasGroupView ? (
    <GroupSampleWrapper
      sampleId={sample.sample._id}
      pinned={pinned}
      onClick={() => setPinned(true)}
      {...hover.handlers}
    >
      <Sample3d />
    </GroupSampleWrapper>
  ) : (
    <SampleWrapper sampleAtom={fos.pinned3DSample}>
      <Sample3d />
    </SampleWrapper>
  );
};

export default () => {
  const threedSlices = useRecoilValueLoadable(fos.all3dSlicesToSampleMap);
  const pinnedSlice = useRecoilValue(fos.pinned3DSampleSlice);
  const slices = useRecoilValue(fos.all3dSlices);
  const groupSlice = useRecoilValue(fos.groupSlice);
  const modalId = useRecoilValue(fos.modalSampleId);

  if (threedSlices.state === "hasError") {
    throw threedSlices.contents;
  }

  const assignSlices = useRecoilTransaction_UNSTABLE(
    ({ set }) =>
      (
        pinnedSlice: string | null,
        slices: string[],
        samples: {
          [k: string]: fos.ModalSample;
        }
      ) => {
        let newSlice: string | null =
          pinnedSlice && samples[pinnedSlice] ? pinnedSlice : null;
        for (let index = 0; index < slices.length; index++) {
          const element = slices[index];
          if (samples[element]) {
            newSlice = element;
            break;
          }
        }

        !newSlice && set(fos.pinned3d, false);
        set(fos.pinned3DSampleSlice, newSlice);
        set(fos.active3dSlices, (cur) => {
          const filtered = cur.filter((s) => samples[s]);
          return Array.from(
            new Set(newSlice ? [newSlice, ...filtered] : filtered)
          );
        });
      },
    []
  );

  useEffect(() => {
    if (threedSlices.state !== "hasValue") {
      return;
    }

    if (groupSlice && slices.includes(groupSlice) && pinnedSlice) {
      return;
    }

    assignSlices(pinnedSlice, slices, threedSlices.contents);
  }, [assignSlices, modalId, slices, groupSlice, pinnedSlice, threedSlices]);

  if (
    threedSlices.state === "hasValue" &&
    !Object.keys(threedSlices.contents).length
  ) {
    return <Loading>No 3D slices</Loading>;
  }

  if (
    threedSlices.state === "loading" ||
    !threedSlices.contents[pinnedSlice || ""]
  ) {
    return <Loading>Pixelating...</Loading>;
  }

  return (
    <GroupSuspense>
      <Sample3dWrapper />
    </GroupSuspense>
  );
};
