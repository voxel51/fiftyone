import { AbstractLooker } from "@fiftyone/looker";
import { modal, useClearModal, useHoveredSample } from "@fiftyone/state";
import React, {
  MutableRefObject,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRecoilValue } from "recoil";
import { SampleBar } from "./Bars";
import Looker from "./Looker";

interface SampleProps {
  lookerRefCallback: (looker: AbstractLooker) => void;
  lookerRef?: MutableRefObject<AbstractLooker | undefined>;
  hideSampleBar?: boolean;
}

const Sample: React.FC<SampleProps> = ({
  lookerRefCallback,
  lookerRef: propsLookerRef,
  hideSampleBar,
}) => {
  const data = useRecoilValue(modal);

  if (!data) {
    throw new Error("no data");
  }

  const lookerRef = useMemo(
    () => propsLookerRef ?? React.createRef<AbstractLooker | undefined>(),
    [propsLookerRef]
  );

  const {
    sample: { _id },
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
      {!hideSampleBar && (
        <SampleBar
          sampleId={_id}
          lookerRef={lookerRef}
          visible={hovering}
          hoveringRef={hoveringRef}
        />
      )}
      <Looker
        key={_id}
        lookerRef={lookerRef}
        lookerRefCallback={lookerRefCallback}
        onClose={clearModal}
      />
    </div>
  );
};

export default Sample;
