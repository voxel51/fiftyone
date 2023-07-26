import { Loading } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { useEffect } from "react";
import { useRecoilState, useRecoilValue, useRecoilValueLoadable } from "recoil";
import { Sample3d } from "../Sample3d";
import { GroupSampleWrapper } from "./GroupSampleWrapper";

const GroupSample3d = () => {
  const sample = useRecoilValue(fos.allPcdSlicesToSampleMap)[
    useRecoilValue(fos.pinned3DSampleSlice)
  ];
  const hover = fos.useHoveredSample(sample);

  return (
    <GroupSampleWrapper
      sampleId={sample.id}
      pinned={false}
      onClick={() => {}}
      {...hover.handlers}
    >
      <Sample3d />
    </GroupSampleWrapper>
  );
};

const Redirect = () => {
  return useRecoilValue(fos.onlyPcd) ? <Sample3d /> : <GroupSample3d />;
};

export default () => {
  const pcdSlices = useRecoilValueLoadable(fos.allPcdSlicesToSampleMap);

  const [pinnedSlice, setPinnedSlice] = useRecoilState(fos.pinned3DSampleSlice);
  const slices = useRecoilValue(fos.allPcdSlices);
  const groupSlice = useRecoilValue(fos.groupSlice(true));

  if (pcdSlices.state === "hasError") {
    throw pcdSlices.contents;
  }

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

    for (let index = 0; index < slices.length; index++) {
      const element = slices[index];

      if (pcdSlices.contents[element]) {
        setPinnedSlice(element);
        return;
      }
    }
  }, [slices, groupSlice, pinnedSlice, pcdSlices, setPinnedSlice]);

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

  return <Redirect />;
};
