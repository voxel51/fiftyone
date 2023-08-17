import { AbstractLooker } from "@fiftyone/looker";
import {
  Lookers,
  ModalSample,
  modalSample,
  modalSampleId,
  useClearModal,
  useHoveredSample,
} from "@fiftyone/state";
import React, { MutableRefObject, useCallback, useRef, useState } from "react";
import { RecoilValueReadOnly, useRecoilValue } from "recoil";
import { SampleBar } from "./Bars";
import Looker from "./Looker";

export const SampleWrapper = ({
  children,
  actions,
  lookerRef,
  sampleAtom = modalSample,
}: React.PropsWithChildren<{
  lookerRef?: MutableRefObject<Lookers | undefined>;
  actions?: boolean;
  sampleAtom?: RecoilValueReadOnly<ModalSample>;
}>) => {
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
  const sample = useRecoilValue(sampleAtom);
  const hover = useHoveredSample(sample.sample, {
    update,
    clear,
  });

  return (
    <div
      style={{ width: "100%", height: "100%", position: "relative" }}
      {...hover.handlers}
    >
      <SampleBar
        sampleId={sample.id}
        lookerRef={lookerRef}
        visible={hovering}
        hoveringRef={hoveringRef}
        actions={actions}
      />
      {children}
    </div>
  );
};

interface SampleProps {
  lookerRefCallback: (looker: Lookers) => void;
  lookerRef?: MutableRefObject<Lookers | undefined>;
  actions?: boolean;
}

const Sample = ({
  lookerRefCallback,
  lookerRef: propsLookerRef,
  actions,
}: SampleProps) => {
  const lookerRef = useRef<Lookers | undefined>(undefined);

  const ref = propsLookerRef || lookerRef;

  const id = useRecoilValue(modalSampleId);

  return (
    <SampleWrapper lookerRef={ref} actions={actions}>
      <Looker
        key={`looker-${id}`}
        lookerRef={ref}
        lookerRefCallback={lookerRefCallback}
      />
    </SampleWrapper>
  );
};

export default Sample;
