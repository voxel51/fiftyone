import { useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";
import React, { useRef } from "react";
import { SampleBar } from "./Bars";
import { modal, useClearModal } from "@fiftyone/state";
import Looker from "./Looker";
import { VideoLooker } from "@fiftyone/looker";

const Sample: React.FC = () => {
  const data = useRecoilValue(modal);

  if (!data) {
    throw new Error("no data");
  }

  const lookerRef = useRef<VideoLooker>();

  const {
    sample: { _id },
    navigation,
  } = data;
  const clearModal = useClearModal();

  const options = fos.useLookerOptions(true);

  return (
    <>
      <SampleBar
        sampleId={_id}
        lookerRef={lookerRef}
        visible={options.showControls}
      />
      <Looker
        key={_id}
        lookerRef={lookerRef}
        onNext={() => navigation.getIndex(navigation.index + 1)}
        onClose={clearModal}
        onPrevious={
          navigation.index > 0
            ? () => navigation.getIndex(navigation.index - 1)
            : undefined
        }
      />
    </>
  );
};

export default Sample;
