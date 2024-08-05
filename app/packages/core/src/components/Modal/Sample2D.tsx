import {
  ModalSample,
  isDynamicGroup,
  modalSample,
  modalSampleId,
  useHoveredSample,
} from "@fiftyone/state";
import React, { MutableRefObject, useCallback, useRef, useState } from "react";
import { RecoilValueReadOnly, useRecoilValue } from "recoil";
import { ModalLooker } from "./ModalLooker";

export const SampleWrapper = ({
  children,
  sampleAtom = modalSample,
}: React.PropsWithChildren<{
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
  const isGroup = useRecoilValue(isDynamicGroup);
  const { handlers: hoverEventHandlers } = useHoveredSample(sample.sample, {
    update,
    clear,
  });

  return (
    <div
      style={{ width: "100%", height: "100%", position: "relative" }}
      {...hoverEventHandlers}
    >
      {
        !isGroup && null
        // test: remove this i'm just testing moving this to the modal component
        // <SampleBar
        //   sampleId={sample.sample._id}
        //   visible={hovering}
        //   hoveringRef={hoveringRef}
        //   actions={actions}
        // />
      }
      {children}
    </div>
  );
};

export const Sample2D = () => {
  const id = useRecoilValue(modalSampleId);

  return (
    <SampleWrapper>
      <ModalLooker key={`looker-${id}`} />
    </SampleWrapper>
  );
};
