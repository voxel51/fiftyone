import { AbstractLooker, VideoLooker } from "@fiftyone/looker";
import { modalSample, useClearModal, useHoveredSample } from "@fiftyone/state";
import React, { MutableRefObject, useCallback, useRef, useState } from "react";
import { useRecoilValue } from "recoil";
import { SampleBar } from "./Bars";
import Looker from "./Looker";

const Sample: React.FC<{
  lookerRefCallback: (looker: AbstractLooker) => void;
}> = ({ lookerRefCallback }) => {
  const lookerRef = useRef<VideoLooker>();

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
    timeout.current = setTimeout(clear, 3000) as unknown as number;

    return () => {
      timeout.current && clearTimeout(timeout.current);
    };
  }, [clear, hovering]);
  const hoveringRef = useRef(false);
  const hover = useHoveredSample(useRecoilValue(modalSample).sample, {
    update,
    clear,
  });

  return (
    <div
      style={{ width: "100%", height: "100%", position: "relative" }}
      {...hover.handlers}
    >
      <SampleBar
        sampleId={"bar"}
        lookerRef={lookerRef}
        visible={hovering}
        hoveringRef={hoveringRef}
      />
      <Looker
        key={"looker"}
        lookerRef={lookerRef}
        lookerRefCallback={lookerRefCallback}
        onClose={clearModal}
      />
    </div>
  );
};

export default Sample;
