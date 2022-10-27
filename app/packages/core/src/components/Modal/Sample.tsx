import { useRecoilValue } from "recoil";
import React, { MutableRefObject, useCallback, useRef, useState } from "react";
import { SampleBar } from "./Bars";
import { modal, useClearModal, useHoveredSample } from "@fiftyone/state";
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

  const [hovering, setHovering] = useState(false);

  const timeout: MutableRefObject<number | null> = useRef<number>(null);
  const clear = useCallback(() => {
    if (hoveringRef.current) return;
    timeout.current && clearTimeout(timeout.current);
    setHovering(false);
  }, []);
  const update = useCallback(() => {
    !hovering && setHovering(true);
    timeout.current && clearTimeout(timeout.current);
    timeout.current = setTimeout(clear, 3000);

    return () => {
      timeout.current && clearTimeout(timeout.current);
    };
  }, [clear, hovering]);
  const hoveringRef = useRef(false);
  const hover = useHoveredSample(data.sample, { update, clear });

  return (
    <div
      style={{ width: "100%", height: "100%", position: "relative" }}
      {...hover.handlers}
    >
      <SampleBar
        sampleId={_id}
        lookerRef={lookerRef}
        visible={hovering}
        hoveringRef={hoveringRef}
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
    </div>
  );
};

export default Sample;
