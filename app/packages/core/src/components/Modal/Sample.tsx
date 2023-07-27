import { AbstractLooker } from "@fiftyone/looker";
import {
  modalSample,
  modalSampleId,
  useClearModal,
  useHoveredSample,
} from "@fiftyone/state";
import React, { MutableRefObject, useCallback, useRef, useState } from "react";
import { useRecoilValue } from "recoil";
import { SampleBar } from "./Bars";
import Looker from "./Looker";

export const SampleWrapper = ({
  children,
  hideSampleBar,
  lookerRef,
}: React.PropsWithChildren<{
  lookerRef?: MutableRefObject<AbstractLooker | undefined>;
  hideSampleBar?: boolean;
}>) => {
  const [hovering, setHovering] = useState(false);
  const id = useRecoilValue(modalSampleId);

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
      {!hideSampleBar && (
        <SampleBar
          sampleId={id}
          lookerRef={lookerRef}
          visible={hovering}
          hoveringRef={hoveringRef}
        />
      )}
      {children}
    </div>
  );
};

interface SampleProps {
  lookerRefCallback: (looker: AbstractLooker) => void;
  lookerRef?: MutableRefObject<AbstractLooker | undefined>;
  hideSampleBar?: boolean;
}

const Sample = ({
  lookerRefCallback,
  lookerRef: propsLookerRef,
  hideSampleBar,
}: SampleProps) => {
  const clearModal = useClearModal();
  const lookerRef = useRef<AbstractLooker | undefined>(undefined);

  const ref = propsLookerRef || lookerRef;

  const id = useRecoilValue(modalSampleId);

  return (
    <SampleWrapper lookerRef={ref} hideSampleBar={hideSampleBar}>
      <Looker
        key={`looker-${id}`}
        lookerRef={ref}
        lookerRefCallback={lookerRefCallback}
        onClose={clearModal}
      />
    </SampleWrapper>
  );
};

export default Sample;
