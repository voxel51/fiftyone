import { Loading } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { useEffect } from "react";
import {
  useRecoilState,
  useRecoilTransaction_UNSTABLE,
  useRecoilValue,
  useRecoilValueLoadable,
} from "recoil";
import { SampleWrapper } from "../Sample";
import { Sample3d } from "../Sample3d";
import { GroupSampleWrapper } from "./GroupSampleWrapper";

const Sample3dWrapper = () => {
  const sample = useRecoilValue(fos.pinned3DSample);
  const [pinned, setPinned] = useRecoilState(fos.pinned3d);
  const hover = fos.useHoveredSample(sample);
  const hasGroupView = !useRecoilValue(fos.onlyPcd);

  return hasGroupView ? (
    <GroupSampleWrapper
      sampleId={sample.id}
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
  const pcdSlices = useRecoilValueLoadable(fos.allPcdSlicesToSampleMap);
  const pinnedSlice = useRecoilValue(fos.pinned3DSampleSlice);
  const slices = useRecoilValue(fos.allPcdSlices);
  const groupSlice = useRecoilValue(fos.groupSlice(true));
  const modalId = useRecoilValue(fos.modalSampleId);

  if (pcdSlices.state === "hasError") {
    throw pcdSlices.contents;
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
        let newSlice: string | null = samples[pinnedSlice] ? pinnedSlice : null;
        for (let index = 0; index < slices.length; index++) {
          const element = slices[index];
          if (samples[element]) {
            newSlice = element;
            break;
          }
        }

        !newSlice && set(fos.pinned3d, false);
        set(fos.pinned3DSampleSlice, newSlice);
        set(fos.activePcdSlices, (cur) => {
          const filtered = cur.filter((s) => samples[s]);
          return Array.from(
            new Set(newSlice ? [newSlice, ...filtered] : filtered)
          );
        });
      },
    []
  );

  useEffect(() => {
    if (pcdSlices.state !== "hasValue") {
      return;
    }

    if (groupSlice && slices.includes(groupSlice)) {
      return;
    }

    assignSlices(pinnedSlice, slices, pcdSlices.contents);
  }, [assignSlices, modalId, slices, groupSlice, pinnedSlice, pcdSlices]);

  if (
    pcdSlices.state === "hasValue" &&
    !Object.keys(pcdSlices.contents).length
  ) {
    return <Loading>No PCD slices</Loading>;
  }

  if (pcdSlices.state === "loading" || !pcdSlices.contents[pinnedSlice || ""]) {
    return <Loading>Pixelating...</Loading>;
  }

  return <Sample3dWrapper />;
};
